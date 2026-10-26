import { isFailureCode, type FailureCode } from '@taskelith/kernel';
import {
  capabilityOfRequest,
  parseAgentHarnessCapabilities,
  parseHarnessEvent,
  type HarnessEvent,
  type HarnessRequestKind,
  type ParsedAgentHarnessCapabilities,
} from './agent-harness-data.js';
import type {
  AgentHarness,
  AgentHarnessOperation,
  HarnessCapability,
  HarnessEventData,
  ResponseData,
  SessionRequest,
  SlotCredentialData,
  StartSessionRequest,
} from './agent-harness.js';

// A harness-neutral suite, without a test runner, that a plugin's tests run
// with their own prompts; it checks every result and event at run time.

// Prompts that make the harness answer, ask once, or run until interrupted;
// `input` and `delegation` are needed only when declared.
export interface AgentHarnessConformancePrompts {
  readonly answer: string;
  readonly permission: string;
  readonly longRunning: string;
  readonly input?: string;
  readonly delegation?: string;
}

export interface AgentHarnessConformanceFixture {
  readonly workingDirectory: string;
  readonly stateDirectory: string;
  readonly credential: SlotCredentialData;
  readonly prompts: AgentHarnessConformancePrompts;
  readonly timeoutMs?: number;
}

export type AgentHarnessConformanceCheck =
  | 'capabilities' | 'fixture' | 'threw' | 'result' | 'outcome' | 'event' | 'timeout' | 'undeclared-capability';

export interface AgentHarnessConformanceFinding {
  readonly scenario: string;
  readonly check: AgentHarnessConformanceCheck;
  readonly message: string;
}

export interface AgentHarnessConformanceReport {
  readonly scenarios: number;
  readonly findings: readonly AgentHarnessConformanceFinding[];
}

type Outcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: FailureCode };

interface Scenario {
  readonly name: string;
  readonly needs?: HarnessCapability;
  run(probe: Probe): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export async function runAgentHarnessConformance(
  harness: AgentHarness,
  fixture: AgentHarnessConformanceFixture,
): Promise<AgentHarnessConformanceReport> {
  let capabilities;
  try {
    capabilities = parseAgentHarnessCapabilities(harness.capabilities);
  } catch {
    capabilities = undefined;
  }
  if (capabilities === undefined || !capabilities.ok) {
    const message = capabilities?.ok === false ? capabilities.error.message : 'capabilities could not be read';
    return { scenarios: 0, findings: [{ scenario: 'capabilities', check: 'capabilities', message }] };
  }
  const findings: AgentHarnessConformanceFinding[] = [];
  for (const scenario of SCENARIOS) {
    const probe = new Probe(harness, capabilities.value, fixture, scenario.name, findings);
    if (scenario.needs === undefined || capabilities.value.supported.includes(scenario.needs)) await scenario.run(probe);
    else await undeclared(probe, scenario.needs);
  }
  return { scenarios: SCENARIOS.length, findings };
}

const SCENARIOS: readonly Scenario[] = Object.freeze([
  { name: 'chat with prompt correlation', run: chat },
  { name: 'serialized turns and interruption', run: interruption },
  { name: 'permission request with a single response', run: permission },
  { name: 'input request', needs: 'input-requests', run: (probe: Probe) => answerRequest(probe, 'input-request') },
  { name: 'delegation result by correlation', needs: 'delegation', run: (probe: Probe) => answerRequest(probe, 'delegation-request') },
  { name: 'resume without replaying a pending request', needs: 'resume', run: resume },
  { name: 'terminal only while the session runs', needs: 'terminal', run: terminal },
]);

async function chat(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  probe.expect('second subscriber', await probe.call('events', session), 'conflict');
  for (const turnId of ['turn-1', 'turn-2']) {
    if (!probe.succeeded(`submit ${turnId}`, await probe.submit(session, turnId, probe.prompts.answer))) return;
    await probe.turnEnd(turnId, 'completed');
  }
  probe.expect('repeated turn ID', await probe.submit(session, 'turn-1', probe.prompts.answer), 'conflict');
  probe.expect('unknown native session', await probe.call('submitTurn', { ...session, nativeSessionId: 'unknown', turnId: 'x', text: 'x' }), 'not-found');
  await probe.close(session);
  probe.expect('turn after close', await probe.submit(session, 'turn-3', probe.prompts.answer), 'precondition-failed');
}

async function interruption(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  probe.expect('interrupt with no turn', await probe.call('interrupt', { ...session, turnId: 'turn-1' }), 'precondition-failed');
  if (!probe.succeeded('submit', await probe.submit(session, 'turn-1', probe.prompts.longRunning))) return;
  probe.expect('second turn while one runs', await probe.submit(session, 'turn-2', probe.prompts.answer), 'precondition-failed');
  probe.succeeded('interrupt', await probe.call('interrupt', { ...session, turnId: 'turn-1' }));
  await probe.turnEnd('turn-1', 'interrupted');
  probe.expect('interrupt an ended turn', await probe.call('interrupt', { ...session, turnId: 'turn-1' }), 'precondition-failed');
  await probe.close(session);
}

async function permission(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  if (!probe.succeeded('submit', await probe.submit(session, 'turn-1', probe.prompts.permission))) return;
  const request = await probe.request('permission-request');
  if (request === undefined) return;
  const deny: ResponseData = { kind: 'permission', decision: 'deny', message: 'conformance' };
  const respond = (generation: number, nativeRequestId: string): Promise<Outcome | undefined> =>
    probe.call('respond', { ...session, generation, nativeRequestId, response: deny });
  probe.expect('response at a stale generation', await respond(session.generation + 1, request), 'precondition-failed');
  probe.succeeded('deny', await respond(session.generation, request));
  probe.expect('second response', await respond(session.generation, request), 'conflict');
  probe.expect('unknown native request', await respond(session.generation, 'unknown-request'), 'not-found');
  await probe.turnEnd('turn-1');
  await probe.close(session);
}

async function answerRequest(probe: Probe, kind: 'input-request' | 'delegation-request'): Promise<void> {
  const prompt = kind === 'input-request' ? probe.prompts.input : probe.prompts.delegation;
  if (prompt === undefined) return probe.report('fixture', `${kind} is declared, but the fixture has no prompt for it`);
  const session = await probe.start();
  if (session === undefined) return;
  if (!probe.succeeded('submit', await probe.submit(session, 'turn-1', prompt))) return;
  const request = await probe.request(kind);
  if (request === undefined) return;
  const response = responseFor(kind);
  probe.succeeded('response', await probe.call('respond', { ...session, nativeRequestId: request, response }));
  probe.expect('second response', await probe.call('respond', { ...session, nativeRequestId: request, response }), 'conflict');
  await probe.turnEnd('turn-1');
  await probe.close(session);
}

async function resume(probe: Probe): Promise<void> {
  const first = await probe.start();
  if (first === undefined) return;
  if (!probe.succeeded('submit', await probe.submit(first, 'turn-1', probe.prompts.permission))) return;
  const request = await probe.request('permission-request');
  await probe.close(first);
  const second = await probe.resume(first);
  if (second === undefined || request === undefined) return;
  const response: ResponseData = { kind: 'permission', decision: 'allow' };
  probe.expect('old request after resume', await probe.call('respond', { ...second, nativeRequestId: request, response }), 'not-found');
  probe.expect('old generation', await probe.call('submitTurn', { ...first, turnId: 'turn-2', text: probe.prompts.answer }), 'precondition-failed');
  probe.expect('turn ID of the first generation', await probe.submit(second, 'turn-1', probe.prompts.answer), 'conflict');
  if (probe.succeeded('submit after resume', await probe.submit(second, 'turn-2', probe.prompts.answer))) await probe.turnEnd('turn-2', 'completed');
  await probe.close(second);
}

async function terminal(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  const program = await probe.call('terminalProgram', session);
  if (probe.succeeded('terminal program', program) && program?.ok && !isTerminalProgram(program.value)) {
    probe.report('result', 'terminalProgram must return a non-empty argv of strings and a working directory');
  }
  await probe.close(session);
  probe.expect('terminal after close', await probe.call('terminalProgram', session), 'precondition-failed');
}

// An undeclared capability's operation fails with `unavailable`, whatever
// the session; the input request has no operation of its own to probe.
async function undeclared(probe: Probe, capability: HarnessCapability): Promise<void> {
  const session: SessionRequest = { nativeSessionId: 'undeclared', generation: 1 };
  const label = `${capability} is not declared`;
  const unavailable = (outcome: Outcome | undefined): void => probe.expect(label, outcome, 'unavailable', 'undeclared-capability');
  if (capability === 'resume') {
    unavailable(await probe.call('resumeSession', { ...probe.startRequest(1), nativeSessionId: 'undeclared' }));
  } else if (capability === 'terminal') {
    unavailable(await probe.call('terminalProgram', session));
  } else if (capability === 'delegation') {
    unavailable(await probe.call('respond', { ...session, nativeRequestId: 'undeclared', response: responseFor('delegation-request') }));
  } else if (capability === 'input-requests') {
    unavailable(await probe.call('respond', { ...session, nativeRequestId: 'undeclared', response: responseFor('input-request') }));
  }
}

function responseFor(kind: 'input-request' | 'delegation-request'): ResponseData {
  return kind === 'input-request'
    ? { kind: 'input', text: 'conformance input' }
    : { kind: 'delegation-result', delegationId: 'delegation-1', outcome: 'completed', summary: 'conformance result' };
}

function isTerminalProgram(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { argv, workingDirectory } = value as { argv?: unknown; workingDirectory?: unknown };
  return Array.isArray(argv) && argv.length > 0 && argv.every((item) => typeof item === 'string') && typeof workingDirectory === 'string';
}

// One scenario's view of the harness: it calls operations, reads events of
// the current generation, and records each broken rule as a finding.
class Probe {
  readonly prompts: AgentHarnessConformancePrompts;
  readonly #timeoutMs: number;
  #events: AsyncIterator<HarnessEventData> | undefined;
  #ended = false;
  readonly #turns = new Set<string>();
  readonly #endedTurns = new Set<string>();
  readonly #requests = new Set<string>();
  readonly #sessionId: string;
  readonly #harness: AgentHarness;
  readonly #capabilities: ParsedAgentHarnessCapabilities;
  readonly #fixture: AgentHarnessConformanceFixture;
  readonly #scenario: string;
  readonly #findings: AgentHarnessConformanceFinding[];

  constructor(
    harness: AgentHarness,
    capabilities: ParsedAgentHarnessCapabilities,
    fixture: AgentHarnessConformanceFixture,
    scenario: string,
    findings: AgentHarnessConformanceFinding[],
  ) {
    this.#harness = harness;
    this.#capabilities = capabilities;
    this.#fixture = fixture;
    this.#scenario = scenario;
    this.#findings = findings;
    this.prompts = fixture.prompts;
    this.#timeoutMs = fixture.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#sessionId = `conformance-${SCENARIOS.findIndex((each) => each.name === scenario) + 1}`;
  }

  startRequest(generation: number): StartSessionRequest {
    const { workingDirectory, stateDirectory, credential } = this.#fixture;
    return { sessionId: this.#sessionId, generation, workingDirectory, stateDirectory, credential: { ...credential } };
  }

  async start(): Promise<SessionRequest | undefined> {
    return this.#open('startSession', await this.call('startSession', this.startRequest(1)), 1);
  }

  async resume(previous: SessionRequest): Promise<SessionRequest | undefined> {
    const generation = previous.generation + 1;
    const request = { ...this.startRequest(generation), nativeSessionId: previous.nativeSessionId };
    const handle = await this.#open('resumeSession', await this.call('resumeSession', request), generation);
    if (handle !== undefined && handle.nativeSessionId !== previous.nativeSessionId) {
      this.report('result', 'resumeSession must keep the native session ID');
    }
    return handle;
  }

  submit(session: SessionRequest, turnId: string, text: string): Promise<Outcome | undefined> {
    const outcome = this.call('submitTurn', { ...session, turnId, text });
    return outcome.then((result) => {
      if (result?.ok) this.#turns.add(turnId);
      return result;
    });
  }

  async close(session: SessionRequest): Promise<void> {
    if (!this.succeeded('close', await this.call('closeSession', session))) return;
    const ended = await this.#next((event) => event.kind === 'session-ended');
    if (ended !== undefined && ended.kind === 'session-ended' && ended.reason !== 'closed') {
      this.report('outcome', `a closed session must end as closed, not ${ended.reason}`);
    }
    if (ended !== undefined && !(await this.#streamEnds())) this.report('event', 'the events must end after session-ended');
    this.succeeded('close again', await this.call('closeSession', session));
  }

  async request(kind: HarnessRequestKind): Promise<string | undefined> {
    if (!this.#capabilities.supported.includes(capabilityOfRequest(kind))) return undefined;
    const event = await this.#next((each) => each.kind === kind);
    return event !== undefined && 'nativeRequestId' in event ? event.nativeRequestId : undefined;
  }

  async turnEnd(turnId: string, outcome?: string): Promise<void> {
    const event = await this.#next((each) => each.kind === 'turn-ended' && each.turnId === turnId);
    if (event?.kind === 'turn-ended' && outcome !== undefined && event.outcome !== outcome) {
      this.report('outcome', `turn ${turnId} ended as ${event.outcome}, not ${outcome}`);
    }
  }

  // Calls an operation; a throw or a malformed Result is a finding and
  // yields undefined.
  async call<Operation extends AgentHarnessOperation>(
    operation: Operation,
    request: Parameters<AgentHarness[Operation]>[0],
  ): Promise<Outcome | undefined> {
    let raw: unknown;
    try {
      const method = this.#harness[operation] as (request: unknown) => Promise<unknown>;
      raw = await method.call(this.#harness, request);
    } catch (error) {
      this.report('threw', `${operation} threw instead of returning a Result: ${String(error)}`);
      return undefined;
    }
    const outcome = readOutcome(raw);
    if (outcome === undefined) this.report('result', `${operation} returned no kernel Result`);
    return outcome;
  }

  succeeded(label: string, outcome: Outcome | undefined): boolean {
    if (outcome !== undefined && !outcome.ok) this.report('outcome', `${label}: expected success, got ${outcome.code}`);
    return outcome?.ok === true;
  }

  expect(label: string, outcome: Outcome | undefined, code: FailureCode, check: AgentHarnessConformanceCheck = 'outcome'): void {
    if (outcome === undefined) return;
    if (outcome.ok) this.report(check, `${label}: expected ${code}, got success`);
    else if (outcome.code !== code) this.report(check, `${label}: expected ${code}, got ${outcome.code}`);
  }

  report(check: AgentHarnessConformanceCheck, message: string): void {
    this.#findings.push({ scenario: this.#scenario, check, message });
  }

  async #open(operation: string, handle: Outcome | undefined, generation: number): Promise<SessionRequest | undefined> {
    if (!this.succeeded(operation, handle) || !handle?.ok) return undefined;
    const nativeSessionId = (handle.value as { nativeSessionId?: unknown } | undefined)?.nativeSessionId;
    if (typeof nativeSessionId !== 'string' || nativeSessionId.length === 0) {
      this.report('result', `${operation} must return a native session ID`);
      return undefined;
    }
    const session = { nativeSessionId, generation };
    const events = await this.call('events', session);
    if (!this.succeeded('events', events) || !events?.ok) return undefined;
    this.#events = iteratorOf(events.value);
    if (this.#events === undefined) this.report('result', 'events must return an async iterable');
    this.#ended = false;
    this.#requests.clear();
    return this.#events === undefined ? undefined : session;
  }

  // Reads events until one matches; each is parsed and checked against the
  // session's rules on the way. A timeout or an early end is a finding.
  async #next(matches: (event: HarnessEvent) => boolean): Promise<HarnessEvent | undefined> {
    const events = this.#events;
    if (events === undefined) return undefined;
    for (;;) {
      const step = await this.#read(events);
      if (step === 'timeout') return (this.report('timeout', `no matching event within ${this.#timeoutMs} ms`), undefined);
      if (step === 'threw' || step.done) return (this.report('event', 'the events ended before the expected event'), undefined);
      const event = this.#check(step.value);
      if (event !== undefined && matches(event)) return event;
    }
  }

  async #streamEnds(): Promise<boolean> {
    const step = this.#events === undefined ? 'threw' : await this.#read(this.#events);
    return step !== 'timeout' && step !== 'threw' && step.done === true;
  }

  async #read(events: AsyncIterator<HarnessEventData>): Promise<IteratorResult<HarnessEventData> | 'timeout' | 'threw'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), this.#timeoutMs); });
    try {
      return await Promise.race([events.next(), timeout]);
    } catch (error) {
      this.report('threw', `the events threw: ${String(error)}`);
      return 'threw';
    } finally {
      clearTimeout(timer);
    }
  }

  #check(raw: unknown): HarnessEvent | undefined {
    const parsed = parseHarnessEvent(raw, this.#capabilities);
    if (!parsed.ok) return (this.report('event', parsed.error.message), undefined);
    const event = parsed.value;
    if (this.#ended) this.report('event', `${event.kind} after session-ended`);
    if ('turnId' in event && !this.#turns.has(event.turnId)) this.report('event', `${event.kind} names unknown turn ${event.turnId}`);
    if ('nativeRequestId' in event) {
      if (this.#requests.has(event.nativeRequestId)) this.report('event', `native request ${event.nativeRequestId} was reused`);
      this.#requests.add(event.nativeRequestId);
    }
    if (event.kind === 'turn-ended') {
      if (this.#endedTurns.has(event.turnId)) this.report('event', `turn ${event.turnId} ended twice`);
      this.#endedTurns.add(event.turnId);
    }
    if (event.kind === 'session-ended') this.#ended = true;
    return event;
  }
}

function readOutcome(raw: unknown): Outcome | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const result = raw as { ok?: unknown; value?: unknown; error?: { code?: unknown } };
  if (result.ok === true) return { ok: true, value: result.value };
  const code = result.ok === false ? result.error?.code : undefined;
  return typeof code === 'string' && isFailureCode(code) ? { ok: false, code } : undefined;
}

function iteratorOf(value: unknown): AsyncIterator<HarnessEventData> | undefined {
  const iterate = (value as Partial<AsyncIterable<HarnessEventData>> | undefined)?.[Symbol.asyncIterator];
  return typeof iterate === 'function' ? iterate.call(value) : undefined;
}
