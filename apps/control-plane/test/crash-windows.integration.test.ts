import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { describe, test, type TestContext } from 'node:test';
import type { Execution, JournaledExecution, Task } from '@taskelith/execution';
import { JetStreamPublisher, type ControlPlaneConnection, type TransportAddress } from '@taskelith/nats';
import { scenarioRecorderFromEnvironment, SeededRandom, seedFromEnvironment, value } from '@taskelith/testing';
import {
  adoptingSupervisors,
  ComposedWorker,
  establishedOrder,
  HarnessInstallation,
  journalSnapshot,
  leftoverProcesses,
  reapLeftovers,
  releaseChild,
  Releases,
  spawnedChildren,
  tracedCrashes,
  waitFor,
} from './harness-composition.ts';

// G2 item 24b: a crash at each launch window W1 to W6 (worker journal
// contract) and supervisor window CP1 to CP12 (supervisor identity contract).
const TASK_ID = 'crash-task';
const OFFER = 'execution.assignment.offer';
const SEED = seedFromEnvironment();
const SCENARIO_TIMEOUT = 180_000;
// A scenario aborts its own waits this long before the runner's timeout,
// so its cleanup and its `failed` record still run.
const TEARDOWN_MARGIN = 30_000;
const LEFTOVER_MILLISECONDS = 15_000;
const QUIET_MILLISECONDS = 1_000;
const MACOS_ONLY = 'the composed worker supervises natively on macOS only; item 25 runs it on Linux';
const NATIVE = { skip: process.platform === 'darwin' ? false : MACOS_ONLY, timeout: SCENARIO_TIMEOUT };
const BY_THE_BOUND = 'by the bound';

type Outcome = 'exited-code-0' | 'uncertain';
// When the scripted child may exit: an exit fact needs it gone before the
// crash, and an adoption needs it alive until the adopter runs.
type ChildRelease = 'at-once' | 'after-restart' | 'after-adoption';

interface CrashWindow {
  readonly window: string;
  // The point each run arms, in order; the run after the last is unarmed.
  readonly points: readonly string[];
  readonly outcome: Outcome;
  readonly spawns: 0 | 1;
  readonly childRelease: ChildRelease;
  // The journaled state a read-and-outbox crash (CP10, CP12) leaves.
  readonly journaled?: 'started' | 'exited';
  // A known product defect the scenario fails on, until it is fixed.
  readonly defect?: 'D1';
}

const exitedOnce = (window: string, ...points: string[]): CrashWindow => ({ window, points, outcome: 'exited-code-0', spawns: 1, childRelease: 'after-restart' });
const afterExit = (window: string): CrashWindow => ({ ...exitedOnce(window, window), childRelease: 'at-once' });
// D1 (verification.md): the relaunch after `not-started` is rejected with
// `execution-conflict`; these turn red once D1 is fixed.
const failsOnD1 = (window: string, ...points: string[]): CrashWindow => ({ ...exitedOnce(window, ...points), defect: 'D1' });
const D1_SIGNATURE = /D1: the relaunch .+ was rejected-final with execution-conflict/;

// The expected results follow the recovery tables: journal contract
// section 5 and, for macOS, supervisor identity contract section 6.
const WINDOWS: readonly CrashWindow[] = [
  exitedOnce('W1.before', 'W1.before'),
  exitedOnce('W1.after', 'W1.after'),
  exitedOnce('W2.before', 'W2.before'),
  exitedOnce('W2.after', 'W2.after'),
  failsOnD1('W3.before', 'W3.before'),
  failsOnD1('W3.after', 'W3.after'),
  failsOnD1('W4.before', 'W4.before'),
  failsOnD1('W4.after', 'W4.after'),
  exitedOnce('W5s.before', 'W5s.before'),
  exitedOnce('W5s.after', 'W5s.after'),
  afterExit('W5e.before'),
  afterExit('W5e.after'),
  // W6 commits only in a recovery that seals, so a first crash leaves a
  // grant without a record.
  failsOnD1('W6.before', 'W3.after', 'W6.before'),
  failsOnD1('W6.after', 'W3.after', 'W6.after'),
  failsOnD1('CP1', 'CP1'),
  failsOnD1('CP2', 'CP2'),
  failsOnD1('CP3', 'CP3'),
  exitedOnce('CP4', 'CP4'),
  failsOnD1('CP5', 'CP5'),
  failsOnD1('CP6', 'CP6'),
  { window: 'CP7', points: ['CP7'], outcome: 'uncertain', spawns: 0, childRelease: 'after-restart' },
  { window: 'CP8', points: ['CP8'], outcome: 'uncertain', spawns: 1, childRelease: 'after-restart' },
  // A macOS adopter only observes; once the child is gone nothing proves
  // that no descendant lives (supervisor identity contract, section 6).
  { window: 'CP9', points: ['CP9'], outcome: 'uncertain', spawns: 1, childRelease: 'after-adoption' },
  { ...exitedOnce('CP10', 'CP10'), journaled: 'started' },
  afterExit('CP11'),
  { ...afterExit('CP12'), journaled: 'exited' },
];

// The supervisor process reaches these; the worker reaches every other.
const SUPERVISOR_POINTS: ReadonlySet<string> = new Set(['CP5', 'CP6', 'CP7', 'CP8', 'CP9', 'CP11']);

function scenarioName(window: string): string {
  return `crash-window-${window.toLowerCase().replace('.', '-')}`;
}

// Records the scenario's result, `failed` with the error before rethrowing.
async function recorded(scenario: string, body: () => Promise<string>): Promise<void> {
  const recorder = scenarioRecorderFromEnvironment();
  const run = { scenario, seed: SEED, target: 'harness-composition' as const };
  let detail: string;
  try {
    detail = await body();
  } catch (error) {
    await recorder.record({ ...run, outcome: 'failed', detail: String(error).slice(0, 500) });
    throw error;
  }
  await recorder.record({ ...run, outcome: 'passed', detail });
}

function scenarioSignal(context: TestContext): AbortSignal {
  return AbortSignal.any([context.signal, AbortSignal.timeout(SCENARIO_TIMEOUT - TEARDOWN_MARGIN)]);
}

// Each run of a scenario draws its jitter from its own seed.
function runSeed(run: number): number {
  return (SEED + run) % 2 ** 32;
}

interface ScenarioOptions {
  readonly signal: AbortSignal;
  readonly holdNotStarted?: boolean;
}

class Scenario {
  readonly installation: HarnessInstallation;
  readonly #token: string;
  readonly #options: ScenarioOptions;
  readonly #workers: ComposedWorker[] = [];

  private constructor(installation: HarnessInstallation, token: string, options: ScenarioOptions) {
    this.installation = installation;
    this.#token = token;
    this.#options = options;
  }

  static async start(options: ScenarioOptions): Promise<Scenario> {
    const installation = await HarnessInstallation.start(options.signal);
    try {
      return new Scenario(installation, await installation.enrollmentToken(), options);
    } catch (error) {
      await installation.stop().catch((cleanup: unknown) => {
        throw new AggregateError([error, cleanup], 'a failed start could not release its installation');
      });
      throw error;
    }
  }

  async startWorker(armed?: string): Promise<ComposedWorker> {
    const { signal, holdNotStarted } = this.#options;
    const run = {
      installation: this.installation, seed: runSeed(this.#workers.length), signal,
      ...(armed === undefined ? {} : { armed }), ...(holdNotStarted === true ? { holdNotStarted } : {}),
    };
    const worker = await ComposedWorker.start(run, this.#token);
    this.#workers.push(worker);
    return worker;
  }

  wait(what: string | (() => string), condition: () => Promise<boolean>, timeout?: number): Promise<void> {
    return waitFor(what, condition, { signal: this.#options.signal, ...(timeout === undefined ? {} : { timeout }) });
  }

  // A crashed worker is gone; after a supervisor's crash the worker service
  // is stopped, so its start runs recovery as after any restart.
  async crashAt(worker: ComposedWorker, point: string): Promise<void> {
    if (!SUPERVISOR_POINTS.has(point)) return worker.crashed();
    await this.wait(`the supervisor's crash at ${point}`, async () => tracedCrashes(this.installation).includes(point));
    await this.wait('the crashed supervisor to be gone', async () => !(await leftoverProcesses(this.installation)).some((line) => line.includes('armed-supervisor')));
    await worker.stop();
  }

  // The control plane's task once it holds the outcome, or D1's signature
  // once the authority rejected a relaunch with `execution-conflict`.
  async settledUnlessD1(outcome: Outcome): Promise<Task | 'D1'> {
    let conflicted = false;
    const task = await this.taskWhere(`the ${outcome} outcome`, (current) => {
      conflicted = this.installation.launchRejections().some(({ reason }) => reason === 'execution-conflict');
      return conflicted || outcomeReached(current, outcome);
    });
    return conflicted ? 'D1' : task;
  }

  // The control plane's task once it holds the outcome.
  settled(outcome: Outcome): Promise<Task> {
    return this.taskWhere(`the ${outcome} outcome`, (task) => outcomeReached(task, outcome));
  }

  async taskWhere(what: string, reached: (task: Task) => boolean): Promise<Task> {
    let task: Task | undefined;
    await this.wait(() => `${what}: ${JSON.stringify(task)}`, async () => {
      task = await this.installation.task(TASK_ID);
      return reached(task);
    });
    return task!;
  }

  // Every scripted child was released, so nothing of the scenario lives on.
  async noLeftovers(): Promise<void> {
    await this.wait('no process of the scenario', async () => (await leftoverProcesses(this.installation)).length === 0, LEFTOVER_MILLISECONDS);
  }

  async stop(): Promise<void> {
    const releases = new Releases();
    releases.add(() => this.installation.stop());
    releases.add(() => reapLeftovers(this.installation));
    for (const worker of this.#workers) releases.add(() => worker.kill());
    await releases.releaseAll();
  }
}

function outcomeReached(task: Task, outcome: Outcome): boolean {
  return outcome === 'uncertain'
    ? executions(task).some(isUncertain)
    : task.attempts.some((attempt) => attempt.outcome?.kind === 'exited');
}

function executions(task: Task): Execution[] {
  return task.attempts.flatMap((attempt) => attempt.executions);
}

function isUncertain(execution: Execution): boolean {
  return execution.evidence.some((evidence) => evidence.kind === 'uncertain');
}

// D1 exactly: E1 sealed `not-started`, then a relaunch E2 on the same
// assignment whose one operation the authority rejected, and nothing else.
async function d1Failure(scenario: Scenario): Promise<Error> {
  const { installation } = scenario;
  const rejections = installation.launchRejections();
  assert.equal(rejections.length, 1, `one launch rejection: ${JSON.stringify(rejections)}`);
  const [rejection] = rejections as [(typeof rejections)[number]];
  assert.equal(rejection.reason, 'execution-conflict');
  const journal = journalSnapshot(installation);
  assert.equal(journal.intents.length, 1, 'one launch intent');
  const relaunch = journal.executions.find(({ executionId }) => executionId === rejection.executionId);
  const sealed = journal.executions.filter((execution) => execution !== relaunch);
  assert.ok(relaunch !== undefined && sealed.length === 1, `E1 and the rejected E2 alone: ${JSON.stringify(journal.executions)}`);
  const [first] = sealed as [JournaledExecution];
  assert.equal(first.state, 'not-started', `E1 sealed: ${JSON.stringify(first)}`);
  assert.ok(first.authorizations.every(({ outcome }) => !outcome.startsWith('rejected')), `E1 never rejected: ${JSON.stringify(first)}`);
  assert.deepEqual([relaunch.assignmentId, rejection.assignmentId], [first.assignmentId, first.assignmentId], 'E2 on the assignment of E1');
  assert.equal(relaunch.state, undefined, 'E2 never granted');
  assert.deepEqual(relaunch.authorizations.map(({ outcome, rejection: reason }) => ({ outcome, reason })), [{ outcome: 'rejected-final', reason: 'execution-conflict' }]);
  const task = await scenario.taskWhere('E1 not-started in the control plane', (current) => executions(current).length > 0 && executions(current).every(({ state }) => state === 'not-started'));
  assert.equal(task.attempts.length, 1, 'one attempt');
  assert.deepEqual(executions(task).map(({ id }) => id), [first.executionId], 'the control plane knows E1 alone');
  const order = establishedOrder(installation);
  assertNoBoundRelease(order);
  assertD1Order(order, first.executionId, relaunch.executionId);
  await scenario.noLeftovers();
  assert.equal(spawnedChildren(installation).length, 0, 'no spawn');
  return new Error(`D1: the relaunch ${relaunch.executionId} was rejected-final with execution-conflict; established ${order.join(', ')}`);
}

// The hold let E1's `not-started` go, on its first try as on any retry,
// only after E2's rejection.
function assertD1Order(order: readonly string[], sealed: string, relaunch: string): void {
  const answered = order.indexOf(`answered ${relaunch} rejected execution-conflict`);
  const firstRelease = order.findIndex((step) => step.endsWith(`not-started ${sealed}`));
  const ordered = answered >= 0 && firstRelease > answered && order[firstRelease] === `published not-started ${sealed}`;
  assert.ok(ordered, `E2 answered before E1's not-started first went out: ${order.join('; ')}`);
}

// The control plane agrees with the worker's journal on every execution it
// knows; the journal's others never had a grant.
async function recoveredExecution(scenario: Scenario, outcome: Outcome): Promise<Execution> {
  const journal = journalSnapshot(scenario.installation);
  assert.equal(journal.intents.length, 1, 'one launch intent');
  const journaled = new Map(journal.executions.map((execution) => [execution.executionId as string, execution]));
  const agrees = (task: Task) => executions(task).every((execution) => {
    const entry = journaled.get(execution.id);
    return entry?.state === execution.state && entry.uncertain === isUncertain(execution);
  });
  const task = await scenario.taskWhere(`the control plane to agree with ${JSON.stringify(journal.executions)}`, agrees);
  assert.equal(task.attempts.length, 1, 'one attempt');
  const live = executions(task).filter(({ state }) => state !== 'not-started');
  assert.equal(live.length, 1, `one execution beyond not-started: ${JSON.stringify(executions(task))}`);
  const [execution] = live as [Execution];
  if (outcome === 'uncertain') assert.ok(isUncertain(execution) && execution.state !== 'exited', JSON.stringify(execution));
  else assert.deepEqual([execution.state, execution.exit?.status, execution.exit?.startProven], ['exited', { kind: 'code', code: 0 }, true]);
  const known = new Set(executions(task).map(({ id }) => id as string));
  for (const other of journal.executions.filter(({ executionId }) => !known.has(executionId))) {
    assert.ok((other.state ?? 'not-started') === 'not-started' && other.authorizations.every(({ outcome: decided }) => decided !== 'granted'), `never granted: ${JSON.stringify(other)}`);
  }
  return execution;
}

// The step CP10 or CP12 ends with is in the journal before the restart.
function assertJournaled(scenario: Scenario, state: 'started' | 'exited'): void {
  const { executions: journaled } = journalSnapshot(scenario.installation);
  assert.deepEqual(journaled.map((execution) => execution.state), [state], `journaled before the restart: ${JSON.stringify(journaled)}`);
}

function assertNoBoundRelease(order: readonly string[]): void {
  assert.ok(!order.some((step) => step.includes(BY_THE_BOUND)), `a barrier ran into its bound: ${order.join('; ')}`);
}

// The adopting supervisors' records, once one exists, while the child runs.
async function adoption(scenario: Scenario): Promise<string[]> {
  await scenario.wait('an adopting supervisor', async () => adoptingSupervisors(scenario.installation).length > 0);
  return adoptingSupervisors(scenario.installation).map((path) => basename(path));
}

async function runCrashWindow(window: CrashWindow, signal: AbortSignal): Promise<string> {
  const { points, outcome, spawns, childRelease } = window;
  const scenario = await Scenario.start({ signal, holdNotStarted: window.defect === 'D1' });
  try {
    const { installation } = scenario;
    if (childRelease === 'at-once') releaseChild(installation);
    let worker = await scenario.startWorker(points[0]);
    await installation.submitTask(TASK_ID);
    for (const [run, point] of points.entries()) {
      if (run > 0) worker = await scenario.startWorker(point);
      await scenario.crashAt(worker, point);
    }
    assert.deepEqual(tracedCrashes(installation), points);
    if (window.journaled !== undefined) assertJournaled(scenario, window.journaled);
    const restarted = await scenario.startWorker();
    await restarted.ready();
    const adopted = childRelease === 'after-adoption' ? await adoption(scenario) : [];
    releaseChild(installation);
    const task = await scenario.settledUnlessD1(outcome);
    await restarted.stop();
    if (task === 'D1') throw await d1Failure(scenario);
    const execution = await recoveredExecution(scenario, outcome);
    await scenario.noLeftovers();
    assert.equal(spawnedChildren(installation).length, spawns, 'spawns of the scripted child');
    const order = establishedOrder(installation);
    assertNoBoundRelease(order);
    if (points.includes('CP4')) assert.ok(order.includes('CP4 after the claim'), order.join('; '));
    const steps = [...order, ...adopted.map((record) => `child released after the adopter's ${record}`)];
    const established = steps.length === 0 ? '' : `; established ${steps.join(', ')}`;
    return `crashed at ${points.join(' then ')}; recovered to ${outcome} of execution ${execution.id} with ${spawns} spawn(s)${established}`;
  } finally {
    await scenario.stop();
  }
}

interface DeliveredOffer {
  readonly subject: string;
  readonly data: Uint8Array;
  readonly commandId: string;
  readonly workerId: string;
}

// The offer the control plane published, read back from the commands
// stream, which keeps acknowledged messages.
async function deliveredOffer(broker: ControlPlaneConnection, address: TransportAddress, signal: AbortSignal): Promise<DeliveredOffer> {
  const consumer = await broker.js.consumers.get(address.streamName('commands'));
  for (const deadline = Date.now() + 30_000; Date.now() < deadline;) {
    signal.throwIfAborted();
    const message = await consumer.next({ expires: 1000 });
    if (message === null) continue;
    // Confirmations share the subjects and carry no command metadata.
    const { metadata } = JSON.parse(new TextDecoder().decode(message.data)) as { metadata?: { commandType: string; commandId: string; workerId: string } };
    if (metadata?.commandType === OFFER) return { subject: message.subject, data: message.data, commandId: metadata.commandId, workerId: metadata.workerId };
  }
  throw new Error('no offer was published');
}

// The same offer again, under a new broker message identity, as after the
// deduplication window.
async function redeliver(broker: ControlPlaneConnection, offer: DeliveredOffer, copies: number, phase: string): Promise<void> {
  const publisher = new JetStreamPublisher(broker.js);
  for (let copy = 1; copy <= copies; copy += 1) {
    value(await publisher.publish({ subject: offer.subject, body: offer.data, messageId: `${offer.commandId}-${phase}-${copy}` }));
  }
}

async function acknowledgedAll(broker: ControlPlaneConnection, address: TransportAddress, workerId: string): Promise<boolean> {
  const consumer = await broker.jsm.consumers.info(address.streamName('commands'), workerId);
  return consumer.num_pending === 0 && consumer.num_ack_pending === 0;
}

// True once every observation was delivered and acknowledged and none
// arrived for a quiet second, so the control plane processed them all.
function observationsDrained(broker: ControlPlaneConnection, address: TransportAddress): () => Promise<boolean> {
  const stream = address.streamName('observations');
  let lastSequence = -1;
  let quietSince = Date.now();
  return async () => {
    const { state } = await broker.jsm.streams.info(stream);
    const consumers = await broker.jsm.consumers.list(stream).next();
    const idle = consumers.every((consumer) => consumer.num_pending === 0 && consumer.num_ack_pending === 0);
    if (!idle || state.last_seq !== lastSequence) {
      lastSequence = state.last_seq;
      quietSince = Date.now();
      return false;
    }
    return Date.now() - quietSince >= QUIET_MILLISECONDS;
  };
}

// Copies of the offer while the child runs and after its result, seeded.
async function runDuplicateDelivery(signal: AbortSignal): Promise<string> {
  const random = new SeededRandom(SEED);
  const [during, afterwards] = [1 + random.nextInt(3), 1 + random.nextInt(3)];
  const scenario = await Scenario.start({ signal });
  try {
    const { installation } = scenario;
    const worker = await scenario.startWorker();
    await installation.submitTask(TASK_ID);
    const { address } = installation;
    const broker = await installation.connectBroker('duplicates');
    let settled: Task;
    try {
      const offer = await deliveredOffer(broker, address, signal);
      await scenario.taskWhere('the started execution', (current) => executions(current).some(({ state }) => state === 'started'));
      await redeliver(broker, offer, during, 'during');
      await scenario.wait('the copies during the execution acknowledged', () => acknowledgedAll(broker, address, offer.workerId));
      releaseChild(installation);
      settled = await scenario.settled('exited-code-0');
      await redeliver(broker, offer, afterwards, 'after');
      await scenario.wait('every delivery acknowledged', () => acknowledgedAll(broker, address, offer.workerId));
      await scenario.wait('the observations drained', observationsDrained(broker, address));
    } finally {
      await broker.close();
    }
    await worker.stop();
    const execution = await recoveredExecution(scenario, 'exited-code-0');
    const final = await installation.task(TASK_ID);
    assert.equal(executions(final).length, 1, 'one execution');
    assert.deepEqual(final.attempts, settled.attempts, 'the copies after the result changed nothing');
    assert.equal(journalSnapshot(installation).executions.length, 1, 'one journaled execution');
    await scenario.noLeftovers();
    assert.equal(spawnedChildren(installation).length, 1, 'one spawn of the scripted child');
    assertNoBoundRelease(establishedOrder(installation));
    return `${during} copies during and ${afterwards} after the execution; one intent, execution ${execution.id}, one result`;
  } finally {
    await scenario.stop();
  }
}

test('a redelivered offer and assignment give one execution and one result', NATIVE, (context) => recorded('duplicate-delivery', () => runDuplicateDelivery(scenarioSignal(context))));

describe('a crash at each launch and supervisor window recovers to one durable outcome', { concurrency: 4 }, () => {
  for (const window of WINDOWS) {
    const options = window.defect === undefined ? NATIVE : { ...NATIVE, expectFailure: D1_SIGNATURE };
    const name = `a crash at ${window.window} ends ${window.outcome} with ${window.spawns} spawn(s)${window.defect === undefined ? '' : ', failing on D1'}`;
    test(name, options, (context) => recorded(scenarioName(window.window), () => runCrashWindow(window, scenarioSignal(context))));
  }
});
