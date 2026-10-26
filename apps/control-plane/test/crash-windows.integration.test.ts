import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Execution, Task } from '@taskelith/execution';
import { JetStreamPublisher, type ControlPlaneConnection, type TransportAddress } from '@taskelith/nats';
import { scenarioRecorderFromEnvironment, SeededRandom, seedFromEnvironment, value } from '@taskelith/testing';
import {
  CHILD_MILLISECONDS,
  ComposedWorker,
  HarnessInstallation,
  journalSnapshot,
  leftoverProcesses,
  reapLeftovers,
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
const MACOS_ONLY = 'the composed worker supervises natively on macOS only; item 25 runs it on Linux';
const NATIVE = { skip: process.platform === 'darwin' ? false : MACOS_ONLY, timeout: SCENARIO_TIMEOUT };

type Outcome = 'exited-code-0' | 'uncertain';

interface CrashWindow {
  readonly window: string;
  // The point each run arms, in order; the run after the last is unarmed.
  readonly points: readonly string[];
  readonly outcome: Outcome;
  readonly spawns: 0 | 1;
  // A known product defect the scenario fails on, until it is fixed.
  readonly defect?: 'D1';
}

const exitedOnce = (window: string, ...points: string[]): CrashWindow => ({ window, points, outcome: 'exited-code-0', spawns: 1 });
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
  exitedOnce('W5e.before', 'W5e.before'),
  exitedOnce('W5e.after', 'W5e.after'),
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
  { window: 'CP7', points: ['CP7'], outcome: 'uncertain', spawns: 0 },
  { window: 'CP8', points: ['CP8'], outcome: 'uncertain', spawns: 1 },
  // A macOS adopter only observes; once the child is gone nothing proves
  // that no descendant lives (supervisor identity contract, section 6).
  { window: 'CP9', points: ['CP9'], outcome: 'uncertain', spawns: 1 },
  exitedOnce('CP10', 'CP10'),
  exitedOnce('CP11', 'CP11'),
  exitedOnce('CP12', 'CP12'),
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

// Each run of a scenario draws its jitter from its own seed.
function runSeed(run: number): number {
  return (SEED + run) % 2 ** 32;
}

class Scenario {
  readonly installation: HarnessInstallation;
  readonly #token: string;
  readonly #workers: ComposedWorker[] = [];

  private constructor(installation: HarnessInstallation, token: string) {
    this.installation = installation;
    this.#token = token;
  }

  static async start(): Promise<Scenario> {
    const installation = await HarnessInstallation.start();
    return new Scenario(installation, await installation.enrollmentToken());
  }

  async startWorker(armed?: string): Promise<ComposedWorker> {
    const run = { installation: this.installation, seed: runSeed(this.#workers.length), ...(armed === undefined ? {} : { armed }) };
    const worker = await ComposedWorker.start(run, this.#token);
    this.#workers.push(worker);
    return worker;
  }

  // A crashed worker is gone; after a supervisor's crash the worker service
  // is stopped, so its start runs recovery as after any restart.
  async crashAt(worker: ComposedWorker, point: string): Promise<void> {
    if (!SUPERVISOR_POINTS.has(point)) return worker.crashed();
    await waitFor(`the supervisor's crash at ${point}`, async () => tracedCrashes(this.installation).includes(point));
    await waitFor('the crashed supervisor to be gone', async () => !(await leftoverProcesses(this.installation)).some((line) => line.includes('armed-supervisor')));
    await worker.stop();
  }

  // The control plane's task once it holds the outcome, or D1's signature
  // once the authority rejected a relaunch with `execution-conflict`.
  async settledUnlessD1(outcome: Outcome): Promise<Task | 'D1'> {
    let conflicted = false;
    const task = await this.taskWhere(`the ${outcome} outcome`, (current) => {
      conflicted = this.installation.launchRejections().includes('execution-conflict');
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
    await waitFor(() => `${what}: ${JSON.stringify(task)}`, async () => {
      task = await this.installation.task(TASK_ID);
      return reached(task);
    });
    return task!;
  }

  // The scripted child exits by itself, as an unsupervised one does too.
  async noLeftovers(): Promise<void> {
    await waitFor('no process of the scenario', async () => (await leftoverProcesses(this.installation)).length === 0, CHILD_MILLISECONDS * 3);
  }

  async stop(): Promise<void> {
    for (const worker of this.#workers) worker.kill();
    await reapLeftovers(this.installation);
    await this.installation.stop();
  }
}

function outcomeReached(task: Task, outcome: Outcome): boolean {
  return outcome === 'uncertain'
    ? executions(task).some(isUncertain)
    : task.attempts.some((attempt) => attempt.outcome?.kind === 'exited');
}

// D1 in the journal: the relaunched execution's only operation was
// rejected for good with `execution-conflict`, and nothing spawned.
function d1Failure(scenario: Scenario): Error {
  const rejected = journalSnapshot(scenario.installation).executions.filter(({ authorizations }) => authorizations
    .some(({ outcome, rejection }) => outcome === 'rejected-final' && rejection === 'execution-conflict'));
  assert.equal(rejected.length, 1, 'one relaunch rejected with execution-conflict');
  assert.equal(spawnedChildren(scenario.installation).length, 0, 'no spawn');
  return new Error(`D1: the relaunch ${rejected[0]!.executionId} was rejected-final with execution-conflict`);
}

function executions(task: Task): Execution[] {
  return task.attempts.flatMap((attempt) => attempt.executions);
}

function isUncertain(execution: Execution): boolean {
  return execution.evidence.some((evidence) => evidence.kind === 'uncertain');
}

// Exactly one execution of the one attempt is more than `not-started`, in
// the control plane and in the worker's journal alike.
function assertOneDurableOutcome(task: Task, scenario: Scenario, outcome: Outcome): Execution {
  assert.equal(task.attempts.length, 1, 'one attempt');
  const live = executions(task).filter((execution) => execution.state !== 'not-started');
  assert.equal(live.length, 1, `one execution beyond not-started: ${JSON.stringify(executions(task))}`);
  const [execution] = live as [Execution];
  if (outcome === 'uncertain') assert.ok(isUncertain(execution) && execution.state !== 'exited', JSON.stringify(execution));
  else assert.deepEqual([execution.state, execution.exit?.status, execution.exit?.startProven], ['exited', { kind: 'code', code: 0 }, true]);
  const journal = journalSnapshot(scenario.installation);
  assert.equal(journal.intents.length, 1, 'one launch intent');
  const journaled = journal.executions.filter(({ state }) => state !== 'not-started');
  assert.deepEqual(journaled.map(({ executionId, uncertain }) => ({ executionId, uncertain })), [{ executionId: execution.id, uncertain: outcome === 'uncertain' }]);
  return execution;
}

async function runCrashWindow({ points, outcome, spawns }: CrashWindow): Promise<string> {
  const scenario = await Scenario.start();
  try {
    let worker = await scenario.startWorker(points[0]);
    await scenario.installation.submitTask(TASK_ID);
    for (const [run, point] of points.entries()) {
      if (run > 0) worker = await scenario.startWorker(point);
      await scenario.crashAt(worker, point);
    }
    assert.deepEqual(tracedCrashes(scenario.installation), points);
    const restarted = await scenario.startWorker();
    await restarted.ready();
    const task = await scenario.settledUnlessD1(outcome);
    await restarted.stop();
    if (task === 'D1') throw d1Failure(scenario);
    const execution = assertOneDurableOutcome(task, scenario, outcome);
    await scenario.noLeftovers();
    assert.equal(spawnedChildren(scenario.installation).length, spawns, 'spawns of the scripted child');
    return `crashed at ${points.join(' then ')}; recovered to ${outcome} of execution ${execution.id} with ${spawns} spawn(s)`;
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
async function deliveredOffer(broker: ControlPlaneConnection, address: TransportAddress): Promise<DeliveredOffer> {
  const consumer = await broker.js.consumers.get(address.streamName('commands'));
  for (const deadline = Date.now() + 30_000; Date.now() < deadline;) {
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

// Copies of the offer while the child runs and after its result, seeded.
async function runDuplicateDelivery(): Promise<string> {
  const random = new SeededRandom(SEED);
  const [during, afterwards] = [1 + random.nextInt(3), 1 + random.nextInt(3)];
  const scenario = await Scenario.start();
  try {
    const worker = await scenario.startWorker();
    await scenario.installation.submitTask(TASK_ID);
    const { address } = scenario.installation;
    const broker = await scenario.installation.connectBroker('duplicates');
    let task: Task;
    try {
      const offer = await deliveredOffer(broker, address);
      await scenario.taskWhere('the started execution', (current) => executions(current).some(({ state }) => state === 'started'));
      await redeliver(broker, offer, during, 'during');
      task = await scenario.settled('exited-code-0');
      await redeliver(broker, offer, afterwards, 'after');
      await waitFor('every delivery acknowledged', () => acknowledgedAll(broker, address, offer.workerId));
    } finally {
      await broker.close();
    }
    await worker.stop();
    const execution = assertOneDurableOutcome(task, scenario, 'exited-code-0');
    assert.equal(executions(task).length, 1, 'one execution');
    assert.equal(journalSnapshot(scenario.installation).executions.length, 1, 'one journaled execution');
    await scenario.noLeftovers();
    assert.equal(spawnedChildren(scenario.installation).length, 1, 'one spawn of the scripted child');
    return `${during} copies during and ${afterwards} after the execution; one intent, execution ${execution.id}, one result`;
  } finally {
    await scenario.stop();
  }
}

test('a redelivered offer and assignment give one execution and one result', NATIVE, () => recorded('duplicate-delivery', runDuplicateDelivery));

describe('a crash at each launch and supervisor window recovers to one durable outcome', { concurrency: 4 }, () => {
  for (const window of WINDOWS) {
    const options = window.defect === undefined ? NATIVE : { ...NATIVE, expectFailure: D1_SIGNATURE };
    const name = `a crash at ${window.window} ends ${window.outcome} with ${window.spawns} spawn(s)${window.defect === undefined ? '' : ', failing on D1'}`;
    test(name, options, () => recorded(scenarioName(window.window), () => runCrashWindow(window)));
  }
});
