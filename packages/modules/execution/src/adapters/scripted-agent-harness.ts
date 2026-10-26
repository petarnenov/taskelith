import { err, failure, ok, type FailureCode, type Result } from '@taskelith/kernel';
import {
  DELEGATION_OUTCOMES,
  MAX_HARNESS_TEXT_LENGTH,
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
  readonly turnId: string;
  answered: boolean;
  readonly answer: (response: ResponseData) => void;
}

interface RunningTurn {
  readonly turnId: string;
  stopped?: TurnEnd;
  readonly stop: (end: TurnEnd) => void;
  readonly done: Promise<void>;
}

// The state of one native process; a resume replaces it, so an earlier
// process's turn, requests, and end never touch a later one.
interface Generation {
  readonly number: number;
  readonly queue: EventQueue;
  readonly pending: Map<string, PendingRequest>;
  requestCount: number;
  subscribed: boolean;
  ended: boolean;
  closing?: Promise<void>;
  running?: RunningTurn;
}

interface NativeSession {
  readonly nativeSessionId: string;
  readonly turnIds: Set<string>;
  workingDirectory: string;
  current: Generation;
}

type Fields = Readonly<Record<string, unknown>>;

const RESPONSE_CAPABILITY: Readonly<Record<RequestKind, HarnessCapability>> = Object.freeze({
  permission: 'permission-requests',
  input: 'input-requests',
  'delegation-result': 'delegation',
});

const MAX_LABEL_LENGTH = 128;
const MAX_PATH_LENGTH = 1024;

export class ScriptedAgentHarness implements AgentHarness {
  readonly capabilities: AgentHarnessCapabilities;
  readonly #script: ScriptedAgentHarnessOptions['script'];
  readonly #terminal: TerminalProgramData | undefined;
  readonly #sessions = new Map<string, NativeSession>();
  readonly #hostSessions = new Set<string>();
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
    const generation = this.#sessions.get(nativeSessionId)?.current;
    if (generation === undefined || generation.ended) return;
    await this.#end(generation, { kind: 'session-ended', reason: 'exited', exitCode: 1 }, 'harness-exited');
  }

  async startSession(request: StartSessionRequest): Promise<Result<SessionHandleData>> {
    const problem = this.#checkStart(request);
    if (problem !== undefined) return problem;
    if (request.generation !== 1) return fail('invalid', 'a session starts at generation 1');
    if (this.#hostSessions.has(request.sessionId)) return fail('conflict', 'the session already exists');
    this.#hostSessions.add(request.sessionId);
    const nativeSessionId = this.nativeSessionIdFor(this.#hostSessions.size);
    this.#sessions.set(nativeSessionId, {
      nativeSessionId,
      turnIds: new Set(),
      workingDirectory: request.workingDirectory,
      current: newGeneration(1),
    });
    return ok({ nativeSessionId });
  }

  // Only a generation whose end has begun resumes, and only that one is
  // replaced: of concurrent resumes, the first one after the end wins.
  async resumeSession(request: ResumeSessionRequest): Promise<Result<SessionHandleData>> {
    if (!this.#declares('resume')) return fail('unavailable', 'resume is not declared');
    const problem = this.#checkStart(request) ?? checkLabel(request.nativeSessionId, 'native session ID');
    if (problem !== undefined) return problem;
    const session = this.#sessions.get(request.nativeSessionId);
    if (session === undefined) return fail('not-found', 'unknown native session');
    const generation = session.current;
    if (!generation.ended) return fail('precondition-failed', 'a running session does not resume');
    await generation.closing;
    if (session.current !== generation || request.generation !== generation.number + 1) {
      return fail('precondition-failed', 'only an ended session resumes, at the next generation');
    }
    session.current = newGeneration(request.generation);
    session.workingDirectory = request.workingDirectory;
    return ok({ nativeSessionId: session.nativeSessionId });
  }

  async events(request: SessionRequest): Promise<Result<AsyncIterable<HarnessEventData>>> {
    const session = this.#running(request);
    if (!session.ok) return session;
    const generation = session.value.current;
    if (generation.subscribed) return fail('conflict', 'the events already have a subscriber');
    generation.subscribed = true;
    return ok(generation.queue);
  }

  async submitTurn(request: TurnRequest): Promise<Result<void>> {
    const malformed = checkTurnRequest(request);
    if (malformed !== undefined) return malformed;
    const session = this.#running(request);
    if (!session.ok) return session;
    const { turnIds, current } = session.value;
    if (turnIds.has(request.turnId)) return fail('conflict', 'the turn was already submitted');
    if (current.running !== undefined) return fail('precondition-failed', 'a turn is running');
    turnIds.add(request.turnId);
    this.#play(current, request.turnId, this.#script[request.text] ?? [{ output: request.text }]);
    return ok(undefined);
  }

  async interrupt(request: InterruptRequest): Promise<Result<void>> {
    const malformed = checkSessionRequest(request) ?? checkLabel(request.turnId, 'turn ID');
    if (malformed !== undefined) return malformed;
    const session = this.#running(request);
    if (!session.ok) return session;
    const running = session.value.current.running;
    if (running?.turnId !== request.turnId || running.stopped !== undefined) return fail('precondition-failed', 'the turn is not running');
    running.stop({ kind: 'turn-ended', turnId: running.turnId, outcome: 'interrupted' });
    return ok(undefined);
  }

  async respond(request: RespondRequest): Promise<Result<void>> {
    const kind = responseKind(request);
    if (kind === undefined) return fail('invalid', 'unknown response kind');
    if (!this.#declares(RESPONSE_CAPABILITY[kind])) return fail('unavailable', `${kind} responses are not declared`);
    const malformed = checkSessionRequest(request) ?? checkLabel(request.nativeRequestId, 'native request ID');
    if (malformed !== undefined) return malformed;
    if (!isValidResponse(request.response)) return fail('invalid', 'the response is malformed');
    const session = this.#running(request);
    if (!session.ok) return session;
    const pending = session.value.current.pending.get(request.nativeRequestId);
    if (pending === undefined) return fail('not-found', 'unknown or expired native request');
    if (pending.kind !== kind) return fail('invalid', 'the response does not match the request');
    if (pending.answered) return fail('conflict', 'the request was already answered');
    pending.answered = true;
    pending.answer(request.response);
    return ok(undefined);
  }

  async terminalProgram(request: SessionRequest): Promise<Result<TerminalProgramData>> {
    if (!this.#declares('terminal')) return fail('unavailable', 'terminal is not declared');
    const session = this.#running(request);
    if (!session.ok) return session;
    return ok(this.#terminal ?? { argv: ['scripted-terminal'], workingDirectory: session.value.workingDirectory });
  }

  async closeSession(request: SessionRequest): Promise<Result<void>> {
    const session = this.#known(request);
    if (!session.ok) return session;
    const generation = session.value.current;
    if (request.generation !== generation.number) return fail('precondition-failed', 'stale generation');
    await (generation.closing ?? this.#end(generation, { kind: 'session-ended', reason: 'closed' }, undefined));
    return ok(undefined);
  }

  // The native IDs; a subclass may issue others, as a real harness does.
  protected nativeSessionIdFor(count: number): string {
    return `scripted-${count}`;
  }

  protected nativeRequestIdFor(generation: number, count: number): string {
    return `request-${generation}-${count}`;
  }

  // Ends the generation once: a running turn first, then the stream. Every
  // concurrent caller waits for the same end.
  #end(generation: Generation, ended: HarnessEventData, turnFailure: HarnessFailure | undefined): Promise<void> {
    generation.ended = true;
    generation.closing = (async () => {
      const running = generation.running;
      if (running !== undefined && running.stopped === undefined) {
        running.stop(turnFailure === undefined
          ? { kind: 'turn-ended', turnId: running.turnId, outcome: 'interrupted' }
          : { kind: 'turn-ended', turnId: running.turnId, outcome: 'failed', failure: turnFailure });
      }
      await running?.done;
      generation.pending.clear();
      generation.queue.push(ended);
      generation.queue.end();
    })();
    return generation.closing;
  }

  #checkStart(request: StartSessionRequest): Result<never> | undefined {
    if (!isRecord(request)) return fail('invalid', 'the request must be an object');
    const problem = checkLabel(request.sessionId, 'session ID')
      ?? checkGeneration(request.generation)
      ?? checkPath(request.binaryPath, 'binary path')
      ?? checkPath(request.workingDirectory, 'working directory')
      ?? checkPath(request.stateDirectory, 'state directory');
    if (problem !== undefined) return problem;
    const credential: unknown = request.credential;
    const mechanism = isRecord(credential) && typeof credential.secret === 'string' ? credential.mechanism : undefined;
    if (typeof mechanism !== 'string' || !this.capabilities.subscriptionMechanisms.includes(mechanism)) {
      return fail('invalid', 'the credential mechanism is not declared');
    }
    return undefined;
  }

  // A well-formed request's session at its current, running generation.
  #running(request: SessionRequest): Result<NativeSession> {
    const session = this.#known(request);
    if (!session.ok) return session;
    const { current } = session.value;
    if (current.ended || request.generation !== current.number) {
      return fail('precondition-failed', 'the session is not running at this generation');
    }
    return session;
  }

  // A malformed request is `invalid` before any state is read, so that it
  // is told apart from a stale one.
  #known(request: SessionRequest): Result<NativeSession> {
    const malformed = checkSessionRequest(request);
    if (malformed !== undefined) return malformed;
    const session = this.#sessions.get(request.nativeSessionId);
    return session === undefined ? fail('not-found', 'unknown native session') : ok(session);
  }

  #declares(capability: HarnessCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  // A stop wins over an outcome the script reached but has not published,
  // so an accepted interrupt always ends the turn as the stop says.
  #play(generation: Generation, turnId: string, steps: readonly ScriptStep[]): void {
    let resolveStop!: (value: 'stopped') => void;
    const stopped = new Promise<'stopped'>((resolve) => { resolveStop = resolve; });
    const running: RunningTurn = {
      turnId,
      stop: (end) => {
        running.stopped = end;
        expireRequests(generation, turnId);
        resolveStop('stopped');
      },
      done: this.#playSteps(generation, turnId, steps, stopped).then((outcome) => {
        if (generation.running === running) generation.running = undefined;
        expireRequests(generation, turnId);
        generation.queue.push(running.stopped ?? outcome);
      }),
    };
    generation.running = running;
  }

  async #playSteps(
    generation: Generation,
    turnId: string,
    steps: readonly ScriptStep[],
    stopped: Promise<'stopped'>,
  ): Promise<TurnEnd> {
    const completed: TurnEnd = { kind: 'turn-ended', turnId, outcome: 'completed' };
    const { queue } = generation;
    for (const step of steps) {
      if ('end' in step) return { kind: 'turn-ended', turnId, outcome: step.end, ...(step.failure ? { failure: step.failure } : {}) };
      if ('waitForInterrupt' in step) return (await stopped, completed);
      if ('output' in step) pushOutput(queue, turnId, step.output);
      else if ('usage' in step) queue.push({ kind: 'account-signal', signal: 'usage', usage: step.usage });
      else if ('limit' in step) queue.push({ kind: 'account-signal', signal: 'limit', ...step.limit });
      else {
        const answer = await Promise.race([this.#ask(generation, turnId, step), stopped]);
        if (answer === 'stopped') return completed;
        this.#apply(generation, turnId, answer);
      }
    }
    return completed;
  }

  // An allowed permission runs its action; input and delegation results are
  // echoed, so a test can see that the answer reached the harness.
  #apply(generation: Generation, turnId: string, response: ResponseData): void {
    if (response.kind === 'permission') {
      if (response.decision === 'allow') this.#actionRuns += 1;
      return;
    }
    const text = response.kind === 'input' ? response.text : `${response.delegationId} ${response.outcome}: ${response.summary}`;
    pushOutput(generation.queue, turnId, text);
  }

  #ask(
    generation: Generation,
    turnId: string,
    step: Extract<ScriptStep, { permission: string } | { input: string } | { delegation: string }>,
  ): Promise<ResponseData> {
    generation.requestCount += 1;
    const nativeRequestId = this.nativeRequestIdFor(generation.number, generation.requestCount);
    const { pending, queue } = generation;
    return new Promise((answer) => {
      if ('permission' in step) {
        pending.set(nativeRequestId, { kind: 'permission', turnId, answered: false, answer });
        queue.push({
          kind: 'permission-request', turnId, nativeRequestId, summary: step.permission, ...(step.operation ? { operation: step.operation } : {}),
        });
      } else if ('input' in step) {
        pending.set(nativeRequestId, { kind: 'input', turnId, answered: false, answer });
        queue.push({ kind: 'input-request', turnId, nativeRequestId, prompt: step.input });
      } else {
        pending.set(nativeRequestId, { kind: 'delegation-result', turnId, answered: false, answer });
        queue.push({ kind: 'delegation-request', turnId, nativeRequestId, instructions: step.delegation });
      }
    });
  }
}

function newGeneration(number: number): Generation {
  return { number, queue: new EventQueue(), pending: new Map(), requestCount: 0, subscribed: false, ended: false };
}

// A turn's unanswered requests expire when it ends; an answered one stays,
// so that a second response is still a conflict.
function expireRequests(generation: Generation, turnId: string): void {
  for (const [nativeRequestId, request] of generation.pending) {
    if (request.turnId === turnId && !request.answered) generation.pending.delete(nativeRequestId);
  }
}

// Output longer than one event allows is split into several events.
function pushOutput(queue: EventQueue, turnId: string, text: string): void {
  let start = 0;
  do {
    queue.push({ kind: 'output', turnId, text: text.slice(start, start + MAX_HARNESS_TEXT_LENGTH) });
    start += MAX_HARNESS_TEXT_LENGTH;
  } while (start < text.length);
}

function checkSessionRequest(request: SessionRequest): Result<never> | undefined {
  if (!isRecord(request)) return fail('invalid', 'the request must be an object');
  return checkLabel(request.nativeSessionId, 'native session ID') ?? checkGeneration(request.generation);
}

function checkTurnRequest(request: TurnRequest): Result<never> | undefined {
  const malformed = checkSessionRequest(request) ?? checkLabel(request.turnId, 'turn ID');
  if (malformed !== undefined) return malformed;
  return typeof request.text === 'string' ? undefined : fail('invalid', 'the turn text must be a string');
}

function checkGeneration(generation: unknown): Result<never> | undefined {
  return Number.isInteger(generation) && (generation as number) >= 1
    ? undefined
    : fail('invalid', 'generation must be a positive integer');
}

function checkLabel(value: unknown, name: string): Result<never> | undefined {
  return isBounded(value, MAX_LABEL_LENGTH) ? undefined : fail('invalid', `the ${name} must be 1-${MAX_LABEL_LENGTH} characters`);
}

function checkPath(value: unknown, name: string): Result<never> | undefined {
  return isBounded(value, MAX_PATH_LENGTH) ? undefined : fail('invalid', `the ${name} must be 1-${MAX_PATH_LENGTH} characters`);
}

function isBounded(value: unknown, maxLength: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}

function responseKind(request: RespondRequest): RequestKind | undefined {
  const response: unknown = isRecord(request) ? request.response : undefined;
  const kind = isRecord(response) ? response.kind : undefined;
  return typeof kind === 'string' && Object.hasOwn(RESPONSE_CAPABILITY, kind) ? kind as RequestKind : undefined;
}

// Only the fields the response's kind defines, each within its bounds.
function isValidResponse(response: ResponseData): boolean {
  switch (response.kind) {
    case 'permission':
      return hasOnlyFields(response, ['kind', 'decision', 'message'])
        && (PERMISSION_DECISIONS as readonly string[]).includes(response.decision)
        && (response.message === undefined || isText(response.message));
    case 'input': return hasOnlyFields(response, ['kind', 'text']) && isText(response.text);
    case 'delegation-result':
      return hasOnlyFields(response, ['kind', 'delegationId', 'outcome', 'summary'])
        && (DELEGATION_OUTCOMES as readonly string[]).includes(response.outcome)
        && isBounded(response.delegationId, MAX_LABEL_LENGTH)
        && isText(response.summary);
  }
}

function hasOnlyFields(response: object, fields: readonly string[]): boolean {
  return Reflect.ownKeys(response).every((key) => typeof key === 'string' && fields.includes(key));
}

function isText(value: unknown): boolean {
  return typeof value === 'string' && value.length <= MAX_HARNESS_TEXT_LENGTH;
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
