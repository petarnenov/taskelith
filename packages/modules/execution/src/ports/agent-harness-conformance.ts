import type { FailureCode } from '@taskelith/kernel';
import {
  capabilityOfRequest,
  parseAgentHarnessCapabilities,
  parseHarnessEvent,
  parseOperationResult,
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
  TurnOutcome,
} from './agent-harness.js';

// A harness-neutral suite, without a test runner, that a plugin's tests run
// with their own prompts and probes; it checks every result and event.

// `remember` states a fact and `recall` asks for it; `permission` asks once
// for the probe's action. The optional prompts follow their capabilities.
export interface AgentHarnessConformancePrompts {
  readonly remember: string;
  readonly recall: string;
  readonly permission: string;
  readonly longRunning: string;
  readonly input?: string;
  readonly delegation?: string;
  readonly turnLimit?: string;
  readonly accountLimit?: string;
}

// `recalled` is the text a recall answer contains. `actionRuns` counts how
// often the permission prompt's action ran; `endHarness` kills the harness.
export interface AgentHarnessConformanceFixture {
  readonly workingDirectory: string;
  readonly stateDirectory: string;
  readonly binaryPath: string;
  readonly credential: SlotCredentialData;
  readonly prompts: AgentHarnessConformancePrompts;
  readonly recalled: string;
  actionRuns(): Promise<number>;
  endHarness(session: SessionRequest): Promise<void>;
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

type TurnEnded = Extract<HarnessEvent, { kind: 'turn-ended' }>;

interface Scenario {
  readonly name: string;
  readonly needs?: HarnessCapability;
  run(probe: Probe): Promise<void>;
}

interface TurnRecord {
  readonly generation: number;
  output: string;
  outcome?: TurnOutcome;
  limitSignalled: boolean;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 600_000;
const INPUT_ANSWER = 'conformance input 7f3a';
const DELEGATION_SUMMARY = 'conformance delegation 7f3a';
const TIMED_OUT = Symbol('timed out');

export async function runAgentHarnessConformance(
  harness: AgentHarness,
  fixture: AgentHarnessConformanceFixture,
): Promise<AgentHarnessConformanceReport> {
  const capabilities = readCapabilities(harness);
  if (!capabilities.ok) return report(0, 'capabilities', capabilities.message);
  const timeoutMs = fixture.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    return report(0, 'fixture', `timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}`);
  }
  const findings: AgentHarnessConformanceFinding[] = [];
  for (const [index, scenario] of SCENARIOS.entries()) {
    const probe = new Probe({ harness, capabilities: capabilities.value, fixture, timeoutMs, scenario: scenario.name, index, findings });
    if (scenario.needs === undefined || capabilities.value.supported.includes(scenario.needs)) await scenario.run(probe);
    else await undeclared(probe, scenario.needs);
  }
  return { scenarios: SCENARIOS.length, findings };
}

function report(scenarios: number, check: 'capabilities' | 'fixture', message: string): AgentHarnessConformanceReport {
  return { scenarios, findings: [{ scenario: check, check, message }] };
}

function readCapabilities(harness: AgentHarness): { ok: true; value: ParsedAgentHarnessCapabilities } | { ok: false; message: string } {
  try {
    const parsed = parseAgentHarnessCapabilities(harness.capabilities);
    return parsed.ok ? parsed : { ok: false, message: parsed.error.message };
  } catch {
    return { ok: false, message: 'capabilities could not be read' };
  }
}

const SCENARIOS: readonly Scenario[] = Object.freeze([
  { name: 'chat with prompt correlation', run: chat },
  { name: 'serialized turns and interruption', run: interruption },
  { name: 'permission request with a single response', run: permission },
  { name: 'exit observation', run: exitObservation },
  { name: 'turn and account limits', run: limits },
  { name: 'input request', needs: 'input-requests', run: (probe: Probe) => answerRequest(probe, 'input-request') },
  { name: 'delegation result by correlation', needs: 'delegation', run: (probe: Probe) => answerRequest(probe, 'delegation-request') },
  { name: 'resume without replaying a pending request', needs: 'resume', run: resume },
  { name: 'terminal only while the session runs', needs: 'terminal', run: terminal },
]);

async function chat(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  probe.expect('second subscriber', await probe.call('events', session), 'conflict');
  if (!(await probe.turn(session, 'turn-1', probe.prompts.remember, 'completed'))) return;
  if (!(await probe.turn(session, 'turn-2', probe.prompts.recall, 'completed'))) return;
  probe.expectOutput('turn-2', probe.recalled, 'the recall turn does not contain the remembered fact');
  probe.expect('repeated turn ID', await probe.submit(session, 'turn-1', probe.prompts.recall), 'conflict');
  probe.expect('unknown native session', await probe.call('submitTurn', { ...session, nativeSessionId: 'unknown', turnId: 'x', text: 'x' }), 'not-found');
  await probe.close(session);
  probe.expect('turn after close', await probe.submit(session, 'turn-3', probe.prompts.recall), 'precondition-failed');
}

async function interruption(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  probe.expect('interrupt with no turn', await probe.call('interrupt', { ...session, turnId: 'turn-1' }), 'precondition-failed');
  if (!probe.succeeded('submit', await probe.submit(session, 'turn-1', probe.prompts.longRunning))) return;
  probe.expect('second turn while one runs', await probe.submit(session, 'turn-2', probe.prompts.recall), 'precondition-failed');
  probe.succeeded('interrupt', await probe.call('interrupt', { ...session, turnId: 'turn-1' }));
  await probe.turnEnd('turn-1', 'interrupted');
  probe.expect('interrupt an ended turn', await probe.call('interrupt', { ...session, turnId: 'turn-1' }), 'precondition-failed');
  await probe.close(session);
}

// Two requests in one generation: a deny that must not run the action and
// an allow that runs it once; each needs its own native request ID.
async function permission(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  const before = await probe.actionRuns();
  if (before === undefined || !probe.succeeded('submit', await probe.submit(session, 'turn-1', probe.prompts.permission))) return;
  const denied = await probe.request('permission-request');
  if (denied === undefined) return;
  const respond = (response: unknown, nativeRequestId = denied, generation = session.generation): Promise<Outcome | undefined> =>
    probe.call('respond', { ...session, generation, nativeRequestId, response: response as ResponseData });
  const deny = { kind: 'permission', decision: 'deny', message: 'conformance' };
  probe.expect('response at a stale generation', await respond(deny, denied, session.generation + 1), 'precondition-failed');
  probe.expect('unknown response kind', await respond({ kind: 'approval' }), 'invalid');
  probe.expect('malformed decision', await respond({ kind: 'permission', decision: 'maybe' }), 'invalid');
  probe.succeeded('deny', await respond(deny));
  probe.expect('second response', await respond(deny), 'conflict');
  probe.expect('unknown native request', await respond(deny, 'unknown-request'), 'not-found');
  await probe.turnEnd('turn-1');
  await probe.expectActionRuns(before, 'a denied action ran');
  if (!probe.succeeded('submit', await probe.submit(session, 'turn-2', probe.prompts.permission))) return;
  const allowed = await probe.request('permission-request');
  if (allowed === undefined) return;
  probe.succeeded('allow', await respond({ kind: 'permission', decision: 'allow' }, allowed));
  await probe.turnEnd('turn-2');
  await probe.expectActionRuns(before + 1, 'an allowed action did not run exactly once');
  await probe.close(session);
}

async function exitObservation(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  if (!probe.succeeded('submit', await probe.submit(session, 'turn-1', probe.prompts.longRunning))) return;
  if (!(await probe.endHarness(session))) return;
  const turn = await probe.turnEnd('turn-1', 'failed');
  if (turn !== undefined && turn.failure !== 'harness-exited') probe.report('outcome', 'a turn cut by the harness exit must fail as harness-exited');
  await probe.sessionEnd(['exited', 'failed']);
  probe.expect('turn after exit', await probe.submit(session, 'turn-2', probe.prompts.recall), 'precondition-failed');
}

async function limits(probe: Probe): Promise<void> {
  const { turnLimit, accountLimit } = probe.prompts;
  if (turnLimit === undefined && accountLimit === undefined) return;
  const session = await probe.start();
  if (session === undefined) return;
  if (turnLimit !== undefined) await probe.turn(session, 'turn-1', turnLimit, 'turn-limit-reached');
  if (accountLimit !== undefined && (await probe.turn(session, 'turn-2', accountLimit, 'account-limit-reached'))) {
    if (probe.declaresLimitSignal() && !probe.limitSignalled('turn-2')) probe.report('event', 'an account limit must come with a limit signal');
  }
  await probe.close(session);
}

// The answer must reach the harness: the turn's output contains it.
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
  const expected = kind === 'input-request' ? INPUT_ANSWER : DELEGATION_SUMMARY;
  probe.expectOutput('turn-1', expected, `the ${kind} answer did not reach the harness`);
  await probe.close(session);
}

async function resume(probe: Probe): Promise<void> {
  const first = await probe.start();
  if (first === undefined) return;
  if (!(await probe.turn(first, 'turn-1', probe.prompts.remember, 'completed'))) return;
  if (!probe.succeeded('submit', await probe.submit(first, 'turn-2', probe.prompts.permission))) return;
  const request = await probe.request('permission-request');
  await probe.close(first);
  const second = await probe.resume(first);
  if (second === undefined || request === undefined) return;
  const response: ResponseData = { kind: 'permission', decision: 'allow' };
  probe.expect('old request after resume', await probe.call('respond', { ...second, nativeRequestId: request, response }), 'not-found');
  probe.expect('old generation', await probe.call('submitTurn', { ...first, turnId: 'turn-3', text: probe.prompts.recall }), 'precondition-failed');
  probe.expect('turn ID of the first generation', await probe.submit(second, 'turn-1', probe.prompts.recall), 'conflict');
  if (await probe.turn(second, 'turn-3', probe.prompts.recall, 'completed')) {
    probe.expectOutput('turn-3', probe.recalled, 'the resumed session lost its history');
  }
  await probe.close(second);
}

async function terminal(probe: Probe): Promise<void> {
  const session = await probe.start();
  if (session === undefined) return;
  probe.succeeded('terminal program', await probe.call('terminalProgram', session));
  await probe.close(session);
  probe.expect('terminal after close', await probe.call('terminalProgram', session), 'precondition-failed');
}

// An undeclared capability's operation fails with `unavailable`, whatever
// the session; only optional capabilities have a scenario that comes here.
async function undeclared(probe: Probe, capability: HarnessCapability): Promise<void> {
  const session: SessionRequest = { nativeSessionId: 'undeclared', generation: 1 };
  const unavailable = (outcome: Outcome | undefined): void =>
    probe.expect(`${capability} is not declared`, outcome, 'unavailable', 'undeclared-capability');
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
    ? { kind: 'input', text: INPUT_ANSWER }
    : { kind: 'delegation-result', delegationId: 'delegation-1', outcome: 'completed', summary: DELEGATION_SUMMARY };
}

interface ProbeContext {
  readonly harness: AgentHarness;
  readonly capabilities: ParsedAgentHarnessCapabilities;
  readonly fixture: AgentHarnessConformanceFixture;
  readonly timeoutMs: number;
  readonly scenario: string;
  readonly index: number;
  readonly findings: AgentHarnessConformanceFinding[];
}

// One scenario's view of the harness: it calls operations under a deadline,
// reads the current generation's events, and records each broken rule.
class Probe {
  readonly prompts: AgentHarnessConformancePrompts;
  readonly recalled: string;
  readonly #context: ProbeContext;
  readonly #turns = new Map<string, TurnRecord>();
  readonly #requests = new Set<string>();
  #events: AsyncIterator<HarnessEventData> | undefined;
  #generation = 0;
  #ended = false;

  constructor(context: ProbeContext) {
    this.#context = context;
    this.prompts = context.fixture.prompts;
    this.recalled = context.fixture.recalled;
  }

  startRequest(generation: number): StartSessionRequest {
    const { workingDirectory, stateDirectory, binaryPath, credential } = this.#context.fixture;
    const sessionId = `conformance-${this.#context.index + 1}`;
    return { sessionId, generation, binaryPath, workingDirectory, stateDirectory, credential: { ...credential } };
  }

  async start(): Promise<SessionRequest | undefined> {
    return this.#open('startSession', await this.call('startSession', this.startRequest(1)), 1);
  }

  async resume(previous: SessionRequest): Promise<SessionRequest | undefined> {
    const generation = previous.generation + 1;
    const request = { ...this.startRequest(generation), nativeSessionId: previous.nativeSessionId };
    const outcome = await this.call('resumeSession', request);
    if (outcome?.ok && (outcome.value as { nativeSessionId: string }).nativeSessionId !== previous.nativeSessionId) {
      this.report('result', 'resumeSession must keep the native session ID');
    }
    return this.#open('resumeSession', outcome, generation);
  }

  async submit(session: SessionRequest, turnId: string, text: string): Promise<Outcome | undefined> {
    const outcome = await this.call('submitTurn', { ...session, turnId, text });
    if (outcome?.ok) this.#turns.set(turnId, { generation: session.generation, output: '', limitSignalled: false });
    return outcome;
  }

  async turn(session: SessionRequest, turnId: string, text: string, outcome: TurnOutcome): Promise<boolean> {
    if (!this.succeeded(`submit ${turnId}`, await this.submit(session, turnId, text))) return false;
    return (await this.turnEnd(turnId, outcome))?.outcome === outcome;
  }

  async close(session: SessionRequest): Promise<void> {
    const open = [...this.#turns].filter(([, turn]) => turn.generation === session.generation && turn.outcome === undefined);
    if (!this.succeeded('close', await this.call('closeSession', session))) return;
    if (!(await this.sessionEnd(['closed']))) return;
    for (const [turnId, turn] of open) {
      if (turn.outcome !== undefined && turn.outcome !== 'interrupted') {
        this.report('outcome', `turn ${turnId} must end as interrupted when its session closes`);
      }
    }
    this.succeeded('close again', await this.call('closeSession', session));
  }

  async endHarness(session: SessionRequest): Promise<boolean> {
    const ended = await this.#fixtureCall('endHarness', async () => {
      await this.#context.fixture.endHarness({ ...session });
      return true;
    });
    return ended === true;
  }

  async actionRuns(): Promise<number | undefined> {
    const runs = await this.#fixtureCall('actionRuns', () => this.#context.fixture.actionRuns());
    if (runs === undefined || Number.isInteger(runs)) return runs;
    this.report('fixture', 'actionRuns must return an integer');
    return undefined;
  }

  async expectActionRuns(expected: number, message: string): Promise<void> {
    const runs = await this.actionRuns();
    if (runs !== undefined && runs !== expected) this.report('outcome', `${message}: ${runs} runs, expected ${expected}`);
  }

  async request(kind: HarnessRequestKind): Promise<string | undefined> {
    if (!this.#context.capabilities.supported.includes(capabilityOfRequest(kind))) return undefined;
    const event = await this.#next((each) => each.kind === kind);
    return event !== undefined && 'nativeRequestId' in event ? event.nativeRequestId : undefined;
  }

  async turnEnd(turnId: string, outcome?: TurnOutcome): Promise<TurnEnded | undefined> {
    const event = await this.#next((each) => each.kind === 'turn-ended' && each.turnId === turnId);
    if (event?.kind !== 'turn-ended') return undefined;
    if (outcome !== undefined && event.outcome !== outcome) this.report('outcome', `turn ${turnId} ended as ${event.outcome}, not ${outcome}`);
    return event;
  }

  async sessionEnd(reasons: readonly string[]): Promise<boolean> {
    const ended = await this.#next((event) => event.kind === 'session-ended');
    if (ended?.kind !== 'session-ended') return false;
    if (!reasons.includes(ended.reason)) this.report('outcome', `the session ended as ${ended.reason}, not ${reasons.join(' or ')}`);
    for (const [turnId, turn] of this.#turns) {
      if (turn.generation === this.#generation && turn.outcome === undefined) this.report('event', `turn ${turnId} did not end before session-ended`);
    }
    if (!(await this.#streamEnds())) this.report('event', 'the events must end after session-ended');
    return true;
  }

  expectOutput(turnId: string, expected: string, message: string): void {
    if (!(this.#turns.get(turnId)?.output.includes(expected) ?? false)) this.report('outcome', message);
  }

  declaresLimitSignal(): boolean {
    return this.#context.capabilities.accountSignals.includes('limit');
  }

  limitSignalled(turnId: string): boolean {
    return this.#turns.get(turnId)?.limitSignalled ?? false;
  }

  // Calls an operation under the deadline; a throw, a timeout, or a
  // malformed Result is a finding and yields undefined.
  async call<Operation extends AgentHarnessOperation>(
    operation: Operation,
    request: Parameters<AgentHarness[Operation]>[0],
  ): Promise<Outcome | undefined> {
    let raw: unknown;
    try {
      const method = this.#context.harness[operation] as (request: unknown) => Promise<unknown>;
      raw = await this.#withDeadline(Promise.resolve(method.call(this.#context.harness, request)), operation);
    } catch (error) {
      this.report('threw', `${operation} threw instead of returning a Result: ${String(error)}`);
      return undefined;
    }
    if (raw === TIMED_OUT) return undefined;
    const parsed = parseOperationResult(operation, raw);
    if (!parsed.ok) return (this.report('result', `${operation}: ${parsed.error.message}`), undefined);
    return parsed.value.ok ? { ok: true, value: parsed.value.value } : { ok: false, code: parsed.value.error.code };
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
    this.#context.findings.push({ scenario: this.#context.scenario, check, message });
  }

  async #fixtureCall<Value>(name: string, work: () => Promise<Value>): Promise<Value | undefined> {
    try {
      const value = await this.#withDeadline(Promise.resolve(work()), name);
      return value === TIMED_OUT ? undefined : value as Value;
    } catch (error) {
      this.report('fixture', `${name} failed: ${String(error)}`);
      return undefined;
    }
  }

  async #open(operation: string, handle: Outcome | undefined, generation: number): Promise<SessionRequest | undefined> {
    if (!this.succeeded(operation, handle) || !handle?.ok) return undefined;
    const session = { nativeSessionId: (handle.value as { nativeSessionId: string }).nativeSessionId, generation };
    const events = await this.call('events', session);
    if (!this.succeeded('events', events) || !events?.ok) return undefined;
    try {
      this.#events = (events.value as AsyncIterable<HarnessEventData>)[Symbol.asyncIterator]();
    } catch (error) {
      this.report('threw', `the events could not be iterated: ${String(error)}`);
      return undefined;
    }
    this.#generation = generation;
    this.#ended = false;
    this.#requests.clear();
    return session;
  }

  // Reads events until one matches, within one deadline for the whole wait;
  // each is checked against the session's rules on the way.
  async #next(matches: (event: HarnessEvent) => boolean): Promise<HarnessEvent | undefined> {
    const deadline = Date.now() + this.#context.timeoutMs;
    for (;;) {
      const events = this.#events;
      if (events === undefined) return undefined;
      const step = await this.#read(events, deadline - Date.now());
      if (step === 'timeout') return (this.report('timeout', `no matching event within ${this.#context.timeoutMs} ms`), undefined);
      if (step === 'threw' || step.done) return (this.report('event', 'the events ended before the expected event'), undefined);
      const event = this.#check(step.value);
      if (event !== undefined && matches(event)) return event;
    }
  }

  async #streamEnds(): Promise<boolean> {
    const events = this.#events;
    const step = events === undefined ? 'threw' : await this.#read(events, this.#context.timeoutMs);
    return step !== 'timeout' && step !== 'threw' && step.done === true;
  }

  // A read that times out abandons the iterator, so no later read overlaps
  // a pending one; its return() is requested but not awaited.
  async #read(events: AsyncIterator<HarnessEventData>, remainingMs: number): Promise<IteratorResult<HarnessEventData> | 'timeout' | 'threw'> {
    try {
      const step = await this.#withDeadline(Promise.resolve(events.next()), undefined, Math.max(remainingMs, 0));
      if (step !== TIMED_OUT) return step;
      this.#abandon(events);
      return 'timeout';
    } catch (error) {
      this.report('threw', `the events threw: ${String(error)}`);
      this.#abandon(events);
      return 'threw';
    }
  }

  #abandon(events: AsyncIterator<HarnessEventData>): void {
    this.#events = undefined;
    try {
      Promise.resolve(events.return?.()).catch(() => undefined);
    } catch {
      // A throwing return() leaves nothing more to clean up.
    }
  }

  // Resolves to TIMED_OUT once the deadline passes, and reports it when the
  // wait is a named operation; an event wait reports its own timeout.
  async #withDeadline<Value>(work: Promise<Value>, operation: string | undefined, ms = this.#context.timeoutMs): Promise<Value | typeof TIMED_OUT> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
    try {
      const result = await Promise.race([work, late]);
      if (result === TIMED_OUT && operation !== undefined) this.report('timeout', `${operation} did not finish within ${ms} ms`);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  #check(raw: unknown): HarnessEvent | undefined {
    const parsed = parseHarnessEvent(raw, this.#context.capabilities);
    if (!parsed.ok) return (this.report('event', parsed.error.message), undefined);
    const event = parsed.value;
    if (this.#ended) this.report('event', `${event.kind} after session-ended`);
    const turnId = 'turnId' in event ? event.turnId : undefined;
    const turn = turnId === undefined ? undefined : this.#turns.get(turnId);
    if (turnId !== undefined && turn === undefined) this.report('event', `${event.kind} names unknown turn ${turnId}`);
    if (turn !== undefined && turn.generation !== this.#generation) {
      this.report('event', `${event.kind} names turn ${turnId} of an earlier generation`);
    }
    if ('nativeRequestId' in event) {
      if (this.#requests.has(event.nativeRequestId)) this.report('event', `native request ${event.nativeRequestId} was reused`);
      this.#requests.add(event.nativeRequestId);
    }
    this.#record(event, turn);
    return event;
  }

  #record(event: HarnessEvent, turn: TurnRecord | undefined): void {
    if (event.kind === 'session-ended') this.#ended = true;
    if (event.kind === 'account-signal' && event.signal === 'limit') this.#markLimit();
    if (turn === undefined) return;
    if (event.kind === 'output') turn.output += event.text;
    if (event.kind !== 'turn-ended') return;
    if (turn.outcome !== undefined) this.report('event', `turn ${event.turnId} ended twice`);
    turn.outcome = event.outcome;
  }

  // A limit signal has no turn ID; it belongs to the turn that runs.
  #markLimit(): void {
    for (const turn of this.#turns.values()) {
      if (turn.generation === this.#generation && turn.outcome === undefined) turn.limitSignalled = true;
    }
  }
}
