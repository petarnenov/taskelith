import { err, failure, ok, type FailureCode, type Result } from '@taskelith/kernel';
import {
  DELEGATION_OUTCOMES,
  PERMISSION_DECISIONS,
  type AgentHarness,
  type AgentHarnessCapabilities,
  type ClassifiedOperationData,
  type HarnessCapability,
  type HarnessEventData,
  type HarnessFailure,
  type InterruptRequest,
  type RespondRequest,
  type ResponseData,
  type ResumeSessionRequest,
  type SessionHandleData,
  type SessionRequest,
  type StartSessionRequest,
  type TerminalProgramData,
  type TurnOutcome,
  type TurnRequest,
} from '../ports/agent-harness.js';

// A test-only harness that plays a script per prompt text, so the port's
// rules can be checked without a real harness.

export type ScriptStep =
  | { readonly output: string }
  | { readonly permission: string; readonly operation?: ClassifiedOperationData }
  | { readonly input: string }
  | { readonly delegation: string }
  | { readonly usage: number }
  | { readonly limit: { readonly resetsAt?: string } }
  | { readonly waitForInterrupt: true }
  | { readonly end: TurnOutcome; readonly failure?: HarnessFailure };

export interface ScriptedAgentHarnessOptions {
  readonly capabilities: AgentHarnessCapabilities;
  readonly script: Readonly<Record<string, readonly ScriptStep[]>>;
  readonly terminal?: TerminalProgramData;
}

type RequestKind = ResponseData['kind'];

type TurnEnd = Extract<HarnessEventData, { kind: 'turn-ended' }>;

interface PendingRequest {
  readonly kind: RequestKind;
  answered: boolean;
  readonly answer: (response: ResponseData) => void;
}

interface RunningTurn {
  readonly turnId: string;
  stopped?: TurnEnd;
  readonly stop: (end: TurnEnd) => void;
  readonly done: Promise<void>;
}

interface NativeSession {
  readonly nativeSessionId: string;
  readonly workingDirectory: string;
  readonly turnIds: Set<string>;
  generation: number;
  ended: boolean;
  closing?: Promise<void>;
  subscribed: boolean;
  queue: EventQueue;
  pending: Map<string, PendingRequest>;
  requestCount: number;
  running?: RunningTurn;
}

const RESPONSE_CAPABILITY: Readonly<Record<RequestKind, HarnessCapability>> = Object.freeze({
  permission: 'permission-requests',
  input: 'input-requests',
  'delegation-result': 'delegation',
});

export class ScriptedAgentHarness implements AgentHarness {
  readonly capabilities: AgentHarnessCapabilities;
  readonly #script: ScriptedAgentHarnessOptions['script'];
  readonly #terminal: TerminalProgramData | undefined;
  readonly #sessions = new Map<string, NativeSession>();
  #actionRuns = 0;

  constructor(options: ScriptedAgentHarnessOptions) {
    this.capabilities = options.capabilities;
    this.#script = options.script;
    this.#terminal = options.terminal;
  }

  // How often an allowed permission request's action ran, for the
  // conformance fixture's observation.
  actionRuns(): number {
    return this.#actionRuns;
  }

  // Ends the native process from outside, as a crash would.
  async exitHarness(nativeSessionId: string): Promise<void> {
    const session = this.#sessions.get(nativeSessionId);
    if (session === undefined || session.ended) return;
    await this.#end(session, { kind: 'session-ended', reason: 'exited', exitCode: 1 }, 'harness-exited');
  }

  async startSession(request: StartSessionRequest): Promise<Result<SessionHandleData>> {
    const problem = this.#checkStart(request);
    if (problem !== undefined) return problem;
    const nativeSessionId = `scripted-${request.sessionId}`;
    if (this.#sessions.has(nativeSessionId)) return fail('conflict', 'the session already exists');
    this.#sessions.set(nativeSessionId, {
      nativeSessionId,
      workingDirectory: request.workingDirectory,
      turnIds: new Set(),
      generation: request.generation,
      ended: false,
      subscribed: false,
      queue: new EventQueue(),
      pending: new Map(),
      requestCount: 0,
    });
    return ok({ nativeSessionId });
  }

  async resumeSession(request: ResumeSessionRequest): Promise<Result<SessionHandleData>> {
    if (!this.#declares('resume')) return fail('unavailable', 'resume is not declared');
    const problem = this.#checkStart(request);
    if (problem !== undefined) return problem;
    const session = this.#sessions.get(request.nativeSessionId);
    if (session === undefined) return fail('not-found', 'unknown native session');
    if (!session.ended || request.generation <= session.generation) {
      return fail('precondition-failed', 'only an ended session resumes, at a newer generation');
    }
    Object.assign(session, {
      generation: request.generation, ended: false, closing: undefined, subscribed: false, queue: new EventQueue(), requestCount: 0,
    });
    return ok({ nativeSessionId: session.nativeSessionId });
  }

  async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const session = this.#current(request);
    if (!session.ok) return session;
    if (session.value.subscribed) return fail('conflict', 'the events already have a subscriber');
    session.value.subscribed = true;
    return ok(session.value.queue);
  }

  async submitTurn(request: TurnRequest): Promise<Result<void>> {
    const session = this.#current(request);
    if (!session.ok) return session;
    if (session.value.turnIds.has(request.turnId)) return fail('conflict', 'the turn was already submitted');
    if (session.value.running !== undefined) return fail('precondition-failed', 'a turn is running');
    session.value.turnIds.add(request.turnId);
    this.#play(session.value, request.turnId, this.#script[request.text] ?? [{ output: request.text }]);
    return ok(undefined);
  }

  async interrupt(request: InterruptRequest): Promise<Result<void>> {
    const session = this.#current(request);
    if (!session.ok) return session;
    const running = session.value.running;
    if (running?.turnId !== request.turnId || running.stopped !== undefined) return fail('precondition-failed', 'the turn is not running');
    running.stop({ kind: 'turn-ended', turnId: running.turnId, outcome: 'interrupted' });
    return ok(undefined);
  }

  async respond(request: RespondRequest): Promise<Result<void>> {
    const kind = request.response.kind;
    if (!Object.hasOwn(RESPONSE_CAPABILITY, kind)) return fail('invalid', 'unknown response kind');
    if (!this.#declares(RESPONSE_CAPABILITY[kind])) return fail('unavailable', `${kind} responses are not declared`);
    const session = this.#current(request);
    if (!session.ok) return session;
    if (!isValidResponse(request.response)) return fail('invalid', 'the response is malformed');
    const pending = session.value.pending.get(request.nativeRequestId);
    if (pending === undefined) return fail('not-found', 'unknown native request');
    if (pending.kind !== kind) return fail('invalid', 'the response does not match the request');
    if (pending.answered) return fail('conflict', 'the request was already answered');
    pending.answered = true;
    pending.answer(request.response);
    return ok(undefined);
  }

  async terminalProgram(request: SessionRequest): Promise<Result<TerminalProgramData>> {
    if (!this.#declares('terminal')) return fail('unavailable', 'terminal is not declared');
    const session = this.#current(request);
    if (!session.ok) return session;
    return ok(this.#terminal ?? { argv: ['scripted-terminal'], workingDirectory: session.value.workingDirectory });
  }

  async closeSession(request: SessionRequest): Promise<Result<void>> {
    const session = this.#sessions.get(request.nativeSessionId);
    if (session === undefined) return fail('not-found', 'unknown native session');
    if (request.generation !== session.generation) return fail('precondition-failed', 'stale generation');
    await (session.closing ?? this.#end(session, { kind: 'session-ended', reason: 'closed' }, undefined));
    return ok(undefined);
  }

  // Ends the generation once: a running turn first, then the stream. Every
  // concurrent caller waits for the same end.
  #end(session: NativeSession, ended: HarnessEventData, turnFailure: HarnessFailure | undefined): Promise<void> {
    session.ended = true;
    session.closing = (async () => {
      const running = session.running;
      if (running !== undefined && running.stopped === undefined) {
        running.stop(turnFailure === undefined
          ? { kind: 'turn-ended', turnId: running.turnId, outcome: 'interrupted' }
          : { kind: 'turn-ended', turnId: running.turnId, outcome: 'failed', failure: turnFailure });
      }
      await running?.done;
      session.pending = new Map();
      session.queue.push(ended);
      session.queue.end();
    })();
    return session.closing;
  }

  #checkStart(request: StartSessionRequest): Result<never> | undefined {
    if (!Number.isInteger(request.generation) || request.generation < 1) return fail('invalid', 'generation must be a positive integer');
    if (request.binaryPath.length === 0) return fail('invalid', 'the binary path is empty');
    if (!this.capabilities.subscriptionMechanisms.includes(request.credential.mechanism)) {
      return fail('invalid', 'the credential mechanism is not declared');
    }
    return undefined;
  }

  #current(request: SessionRequest): Result<NativeSession> {
    const session = this.#sessions.get(request.nativeSessionId);
    if (session === undefined) return fail('not-found', 'unknown native session');
    if (session.ended || request.generation !== session.generation) return fail('precondition-failed', 'the session is not running at this generation');
    return ok(session);
  }

  #declares(capability: HarnessCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  // A stop wins over an outcome the script reached but has not published,
  // so an accepted interrupt always ends the turn as the stop says.
  #play(session: NativeSession, turnId: string, steps: readonly ScriptStep[]): void {
    let resolveStop!: (value: 'stopped') => void;
    const stopped = new Promise<'stopped'>((resolve) => { resolveStop = resolve; });
    const running: RunningTurn = {
      turnId,
      stop: (end) => {
        running.stopped = end;
        resolveStop('stopped');
      },
      done: this.#playSteps(session, turnId, steps, stopped).then((outcome) => {
        session.running = undefined;
        session.queue.push(running.stopped ?? outcome);
      }),
    };
    session.running = running;
  }

  async #playSteps(
    session: NativeSession,
    turnId: string,
    steps: readonly ScriptStep[],
    stopped: Promise<'stopped'>,
  ): Promise<TurnEnd> {
    const completed: TurnEnd = { kind: 'turn-ended', turnId, outcome: 'completed' };
    for (const step of steps) {
      if ('end' in step) return { kind: 'turn-ended', turnId, outcome: step.end, ...(step.failure ? { failure: step.failure } : {}) };
      if ('waitForInterrupt' in step) return (await stopped, completed);
      if ('output' in step) session.queue.push({ kind: 'output', turnId, text: step.output });
      else if ('usage' in step) session.queue.push({ kind: 'account-signal', signal: 'usage', usage: step.usage });
      else if ('limit' in step) session.queue.push({ kind: 'account-signal', signal: 'limit', ...step.limit });
      else {
        const answer = await Promise.race([this.#ask(session, turnId, step), stopped]);
        if (answer === 'stopped') return completed;
        this.#apply(session, turnId, answer);
      }
    }
    return completed;
  }

  // An allowed permission runs its action; input and delegation results are
  // echoed, so a test can see that the answer reached the harness.
  #apply(session: NativeSession, turnId: string, response: ResponseData): void {
    if (response.kind === 'permission') {
      if (response.decision === 'allow') this.#actionRuns += 1;
      return;
    }
    const text = response.kind === 'input' ? response.text : `${response.delegationId} ${response.outcome}: ${response.summary}`;
    session.queue.push({ kind: 'output', turnId, text });
  }

  #ask(
    session: NativeSession,
    turnId: string,
    step: Extract<ScriptStep, { permission: string } | { input: string } | { delegation: string }>,
  ): Promise<ResponseData> {
    session.requestCount += 1;
    const nativeRequestId = `request-${session.generation}-${session.requestCount}`;
    return new Promise((answer) => {
      if ('permission' in step) {
        session.pending.set(nativeRequestId, { kind: 'permission', answered: false, answer });
        session.queue.push({
          kind: 'permission-request', turnId, nativeRequestId, summary: step.permission, ...(step.operation ? { operation: step.operation } : {}),
        });
      } else if ('input' in step) {
        session.pending.set(nativeRequestId, { kind: 'input', answered: false, answer });
        session.queue.push({ kind: 'input-request', turnId, nativeRequestId, prompt: step.input });
      } else {
        session.pending.set(nativeRequestId, { kind: 'delegation-result', answered: false, answer });
        session.queue.push({ kind: 'delegation-request', turnId, nativeRequestId, instructions: step.delegation });
      }
    });
  }
}

function isValidResponse(response: ResponseData): boolean {
  switch (response.kind) {
    case 'permission':
      return (PERMISSION_DECISIONS as readonly string[]).includes(response.decision)
        && (response.message === undefined || typeof response.message === 'string');
    case 'input': return typeof response.text === 'string';
    case 'delegation-result':
      return (DELEGATION_OUTCOMES as readonly string[]).includes(response.outcome)
        && typeof response.delegationId === 'string' && response.delegationId.length > 0 && typeof response.summary === 'string';
  }
}

function fail(code: FailureCode, message: string): Result<never> {
  return err(failure(code, message));
}

// An unbounded single-consumer queue; the test scripts are short.
class EventQueue implements AsyncIterable<HarnessEventData> {
  readonly #events: HarnessEventData[] = [];
  #ended = false;
  #wake: (() => void) | undefined;

  push(event: HarnessEventData): void {
    this.#events.push(event);
    this.#wake?.();
  }

  end(): void {
    this.#ended = true;
    this.#wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEventData> {
    for (;;) {
      const event = this.#events.shift();
      if (event !== undefined) yield event;
      else if (this.#ended) return;
      else await new Promise<void>((resolve) => { this.#wake = resolve; });
    }
  }
}
