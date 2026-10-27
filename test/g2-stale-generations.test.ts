import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Execution, LaunchOutcome, OperationId } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import { SeededRandom, integrationEndpoint, rerunHint, seedFromEnvironment, value } from '@taskelith/testing';
import { assignmentsOf, supersedeAssignment } from './g2-scenarios/invalidation-writers.ts';
import { OrderedAuthority } from './g2-scenarios/ordered-authority.ts';
import type { ScenarioInstallation } from './g2-scenarios/scenario-installation.ts';
import { assertExitedOnce, grantsUnder, journaledUnder, reachable } from './g2-scenarios/scenario-reads.ts';
import {
  PARTITION_TIMEOUT_MILLISECONDS, SCENARIO_HOST, guardScenarioFile, recordScenario, withInstallation, withPartitions,
} from './g2-scenarios/scenario-run.ts';
import { ScenarioWorker, stopWorkers, type ScenarioWorkerOptions } from './g2-scenarios/scenario-worker.ts';
import { Gate, waitFor } from './g2-scenarios/waiting.ts';

// G2 item 24c: a stale ownership generation and a stale recovery epoch,
// with two workers and a seeded order of their authorization requests.
const SEED = seedFromEnvironment();
console.log(`g2 stale generation scenarios: ${rerunHint(SEED)}`);
const EPOCH_TASKS = ['task-epoch-1', 'task-epoch-2'];
guardScenarioFile();

type WorkerOverrides = Partial<Omit<ScenarioWorkerOptions, 'name' | 'random'>>;

// A worker whose authorization requests wait at a closed gate.
async function heldWorker(installation: ScenarioInstallation, name: string, random: SeededRandom, overrides: WorkerOverrides = {}) {
  const authority = new OrderedAuthority();
  authority.beforeRequest = new Gate();
  const worker = new ScenarioWorker(installation, {
    name, random, nats: installation.nats, runMilliseconds: 1_000, enrollmentToken: await installation.enrollmentToken(),
    authority: authority.wrap, slots: 1, ...overrides,
  });
  await worker.start();
  await waitFor(() => reachable(installation, worker.workerId), 20_000, `${name} is reachable`);
  return { worker, authority };
}

describe('stale generations', SCENARIO_HOST, () => {
  // Seed: A's stale request answered before or after B's. A is cut off and
  // superseded; B owns the next generation and runs the attempt once.
  test('a stale ownership generation is rejected, and the current owner runs the attempt once', { timeout: PARTITION_TIMEOUT_MILLISECONDS }, async () => {
    const random = new SeededRandom(SEED);
    const staleFirst = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'stale-ownership-generation', seed: SEED }, () => withPartitions((toxiproxy) => withInstallation({ postgres: 'direct', toxiproxy }, async (installation) => {
      const nats = toxiproxy.proxy('nats');
      const a = await heldWorker(installation, 'owner-a', random, { nats: integrationEndpoint('TASKELITH_NATS_PROXY_URL') });
      let b: Awaited<ReturnType<typeof heldWorker>> | undefined;
      try {
        await installation.submitTask('task-own');
        await waitFor(() => a.authority.sent.length === 1, 20_000, 'A requests authorization');
        const [stale] = a.authority.sent;
        b = await heldWorker(installation, 'owner-b', random);
        await nats.disconnect();
        await waitFor(async () => !(await reachable(installation, a.worker.workerId)), 20_000, 'A is lost');
        const [superseded] = await assignmentsOf(installation, 'task-own');
        await supersedeAssignment(installation, superseded!.assignmentId);
        await waitFor(() => b!.authority.sent.length === 1, 20_000, 'B requests authorization at the next generation');
        const [current] = b.authority.sent;
        assert.equal(current!.ownershipGeneration, stale!.ownershipGeneration + 1, 'B owns the next generation');
        const forged = await b.authority.direct({ ...current!, ownershipGeneration: stale!.ownershipGeneration, operationId: newOperationId(random) });
        assert.equal(rejectionOf(forged), 'stale-ownership-generation', 'B\'s assignment at A\'s generation');
        const answers = staleFirst ? [a, b] : [b, a];
        for (const { authority } of answers) {
          authority.beforeRequest.open();
          await waitFor(() => authority.answered.length === 1, 20_000, 'the answer');
        }
        const staleRejection = rejectionOf(a.authority.answered[0]!.answer);
        assert.ok(['assignment-not-active', 'stale-ownership-generation'].includes(staleRejection), staleRejection);
        assert.ok(journaledUnder(a.worker, superseded!.assignmentId).every(({ recordWritten }) => !recordWritten), 'A wrote no record');
        await nats.heal();
        await assertExitedOnce(installation, 'task-own');
        const task = await installation.task('task-own');
        assert.deepEqual(grantsUnder(task, superseded!.assignmentId), [], 'A holds no grant');
        return `A answered ${staleFirst ? 'before' : 'after'} B: ${staleRejection}; B's assignment at A's generation: stale-ownership-generation`;
      } finally {
        a.authority.beforeRequest.open();
        b?.authority.beforeRequest.open();
        await stopWorkers(a.worker, b?.worker);
      }
    })));
  });

  // Seed: which request precedes the epoch advance, a test-side write as a
  // restore's. The later is rejected; the earlier start is only evidence.
  test('a stale recovery epoch is rejected, and an old-epoch start is not recorded', { timeout: 120_000 }, async () => {
    const random = new SeededRandom(SEED);
    await recordScenario({ scenario: 'stale-recovery-epoch', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const run = await advanceEpochBetweenRequests(installation, random);
      assert.ok(run.executions.every(({ start, unauthorizedStarts }) => start === undefined && unauthorizedStarts.length === 0), 'no start recorded');
      const commands = await installation.commandsTo(run.earlyWorkerId);
      assert.ok(commands.every(({ type }) => type !== 'execution.cancellation.request'), 'no cancellation');
      return `${run.order}; the other rejected stale-recovery-epoch; the old-epoch start is evidence only`;
    }));
  });

  // Guards the B4 fix (#302): an old-epoch exit is evidence only.
  test('an old-epoch exit is kept as evidence and changes no state', { timeout: 120_000 }, async () => {
    const random = new SeededRandom(SEED);
    await recordScenario({ scenario: 'stale-epoch-exit-is-evidence', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const run = await advanceEpochBetweenRequests(installation, random);
      assert.ok(run.executions.every(({ exit }) => exit === undefined), 'no exit recorded');
      assert.equal((await installation.result(run.taskId)).state, 'pending', 'the task is not ended');
      return `${run.order}; the old-epoch exit changed no state`;
    }));
  });
});

interface EpochRun {
  readonly order: string;
  readonly earlyWorkerId: string;
  readonly taskId: string;
  readonly executions: readonly Execution[];
}

// Two held workers; the seed picks which is granted before the epoch
// advances. The later one is rejected; then the earlier one runs to its exit.
async function advanceEpochBetweenRequests(installation: ScenarioInstallation, random: SeededRandom): Promise<EpochRun> {
  const aFirst = random.nextInt(2) === 1;
  const a = await heldWorker(installation, 'epoch-a', random);
  const b = await heldWorker(installation, 'epoch-b', random);
  try {
    for (const taskId of EPOCH_TASKS) await installation.submitTask(taskId);
    await waitFor(() => a.authority.sent.length === 1 && b.authority.sent.length === 1, 20_000, 'both request authorization');
    const [early, late] = aFirst ? [a, b] : [b, a];
    early.authority.beforeRequest.open();
    await waitFor(() => early.authority.grants.length === 1, 20_000, 'the earlier request is granted');
    await installation.query('UPDATE installation SET recovery_epoch = recovery_epoch + 1');
    late.authority.beforeRequest.open();
    await waitFor(() => late.authority.answered.length === 1, 20_000, 'the later answer');
    assert.equal(rejectionOf(late.authority.answered[0]!.answer), 'stale-recovery-epoch');
    const lateAssignment = late.authority.sent[0]!.assignmentId;
    assert.ok(journaledUnder(late.worker, lateAssignment).every(({ recordWritten }) => !recordWritten), 'no record after the rejection');
    const earlyRequest = early.authority.sent[0]!;
    await waitFor(() => journaledUnder(early.worker, earlyRequest.assignmentId).some(({ state }) => state === 'exited'), 20_000, 'the earlier exit');
    await waitFor(() => keptAsEvidence(installation, early.authority.grants[0]!), 20_000, 'the old-epoch start kept as evidence');
    await waitFor(() => value(early.worker.running.root.journal.backlog()).entries === 0, 20_000, 'every observation confirmed');
    const taskId = await taskOfAttempt(installation, earlyRequest.attemptId);
    const executions = (await installation.task(taskId)).attempts.flatMap((attempt) => attempt.executions);
    return { order: `${aFirst ? 'A' : 'B'} granted before the epoch advanced`, earlyWorkerId: early.worker.workerId, taskId, executions };
  } finally {
    a.authority.beforeRequest.open();
    b.authority.beforeRequest.open();
    await stopWorkers(a.worker, b.worker);
  }
}

function rejectionOf(answer: Result<LaunchOutcome>): string {
  if (!answer.ok) return `failed: ${answer.error.code}`;
  return answer.value.kind === 'rejected' ? answer.value.rejection.reason : answer.value.kind;
}

function newOperationId(random: SeededRandom): OperationId {
  const hex = Array.from({ length: 12 }, () => random.nextInt(16).toString(16)).join('');
  return `e0000000-0000-4000-8000-${hex}` as OperationId;
}

// The control plane's log of a start it kept as quarantine evidence.
function keptAsEvidence(installation: ScenarioInstallation, granted: LaunchOutcome): boolean {
  const executionId = granted.kind === 'granted' ? granted.grant.executionId : undefined;
  return installation.logs.records.some(({ event, fields }) =>
    event === 'execution.start.evidence' && fields.decision === 'quarantine-evidence' && fields.executionId === executionId);
}

async function taskOfAttempt(installation: ScenarioInstallation, attemptId: string): Promise<string> {
  for (const taskId of EPOCH_TASKS) {
    if ((await installation.task(taskId)).attempts.some(({ id }) => id === attemptId)) return taskId;
  }
  throw new Error(`no scenario task holds attempt ${attemptId}`);
}
