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

type RequestKind = 'permission' | 'input' | 'delegation-result';

interface PendingRequest {
  readonly kind: RequestKind;
  answered: boolean;
  readonly answer: () => void;
}

interface NativeSession {
  readonly nativeSessionId: string;
  readonly workingDirectory: string;
  readonly turnIds: Set<string>;
  generation: number;
  ended: boolean;
  subscribed: boolean;
  queue: EventQueue;
  pending: Map<string, PendingRequest>;
  requestCount: number;
  running?: { readonly turnId: string; readonly stop: () => void; readonly done: Promise<void> };
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

  constructor(options: ScriptedAgentHarnessOptions) {
    this.capabilities = options.capabilities;
    this.#script = options.script;
    this.#terminal = options.terminal;
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
      generation: request.generation, ended: false, subscribed: false, queue: new EventQueue(), pending: new Map(), requestCount: 0,
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
    if (session.value.running?.turnId !== request.turnId) return fail('precondition-failed', 'the turn is not running');
    session.value.running.stop();
    return ok(undefined);
  }

  async respond(request: RespondRequest): Promise<Result<void>> {
    const kind = request.response.kind;
    if (!this.#declares(RESPONSE_CAPABILITY[kind])) return fail('unavailable', `${kind} responses are not declared`);
    const session = this.#current(request);
    if (!session.ok) return session;
    if (!isValidResponse(request.response)) return fail('invalid', 'the response is malformed');
    const pending = session.value.pending.get(request.nativeRequestId);
    if (pending === undefined) return fail('not-found', 'unknown native request');
    if (pending.kind !== kind) return fail('invalid', 'the response does not match the request');
    if (pending.answered) return fail('conflict', 'the request was already answered');
    pending.answered = true;
    pending.answer();
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
    if (session.ended) return ok(undefined);
    session.ended = true;
    const running = session.running;
    running?.stop();
    await running?.done;
    session.queue.push({ kind: 'session-ended', reason: 'closed' });
    session.queue.end();
    return ok(undefined);
  }

  #checkStart(request: StartSessionRequest): Result<never> | undefined {
    if (!Number.isInteger(request.generation) || request.generation < 1) return fail('invalid', 'generation must be a positive integer');
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

  #play(session: NativeSession, turnId: string, steps: readonly ScriptStep[]): void {
    let stop!: () => void;
    const stopped = new Promise<'stopped'>((resolve) => { stop = () => resolve('stopped'); });
    const done = this.#playSteps(session, turnId, steps, stopped).then((outcome) => {
      session.running = undefined;
      session.queue.push(outcome);
    });
    session.running = { turnId, stop, done };
  }

  async #playSteps(
    session: NativeSession,
    turnId: string,
    steps: readonly ScriptStep[],
    stopped: Promise<'stopped'>,
  ): Promise<HarnessEventData> {
    const interrupted: HarnessEventData = { kind: 'turn-ended', turnId, outcome: 'interrupted' };
    for (const step of steps) {
      if ('end' in step) return { kind: 'turn-ended', turnId, outcome: step.end, ...(step.failure ? { failure: step.failure } : {}) };
      if ('waitForInterrupt' in step) return (await stopped, interrupted);
      if ('output' in step) session.queue.push({ kind: 'output', turnId, text: step.output });
      else if ('usage' in step) session.queue.push({ kind: 'account-signal', signal: 'usage', usage: step.usage });
      else if ('limit' in step) session.queue.push({ kind: 'account-signal', signal: 'limit', ...step.limit });
      else if (await Promise.race([this.#ask(session, turnId, step), stopped]) === 'stopped') return interrupted;
    }
    return { kind: 'turn-ended', turnId, outcome: 'completed' };
  }

  #ask(
    session: NativeSession,
    turnId: string,
    step: Extract<ScriptStep, { permission: string } | { input: string } | { delegation: string }>,
  ): Promise<'answered'> {
    session.requestCount += 1;
    const nativeRequestId = `request-${session.generation}-${session.requestCount}`;
    return new Promise((resolve) => {
      const answer = (): void => resolve('answered');
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

function isValidResponse(response: RespondRequest['response']): boolean {
  switch (response.kind) {
    case 'permission': return (PERMISSION_DECISIONS as readonly string[]).includes(response.decision);
    case 'input': return typeof response.text === 'string';
    case 'delegation-result': return (DELEGATION_OUTCOMES as readonly string[]).includes(response.outcome);
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
