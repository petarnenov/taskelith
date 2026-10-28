import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, test } from 'node:test';
import type { ExecutionId, LaunchAuthId, Task } from '@taskelith/execution';
import { SeededRandom, integrationEndpoint, rerunHint, seedFromEnvironment, value } from '@taskelith/testing';
import { interceptAck } from './g2-scenarios/ack-interception.ts';
import { CrashingWorker } from './g2-scenarios/crashing-worker.ts';
import { assignmentsOf, cancelAssignment, type AssignmentRow } from './g2-scenarios/invalidation-writers.ts';
import { processesNaming } from './g2-scenarios/leftover-processes.ts';
import { OrderedAuthority } from './g2-scenarios/ordered-authority.ts';
import { CANCEL_SIGNAL, assertContained } from './g2-scenarios/scenario-launch.ts';
import { SCENARIO_LIMITS, type ScenarioInstallation } from './g2-scenarios/scenario-installation.ts';
import {
  assertExitedOnce,
  grantsUnder,
  intentEnded,
  journalOf,
  journaledUnder,
  reachable,
  startedExecutions,
} from './g2-scenarios/scenario-reads.ts';
import {
  PARTITION_TIMEOUT_MILLISECONDS, SCENARIO_HOST, guardScenarioFile, recordScenario, withInstallation, withPartitions,
} from './g2-scenarios/scenario-run.ts';
import { HELD_RUN, ScenarioWorker, type ScenarioWorkerOptions } from './g2-scenarios/scenario-worker.ts';
import { Gate, waitFor } from './g2-scenarios/waiting.ts';

// G2 item 24c: cancellation races. Without an operator cancel API, each
// cancel is a test-side invalidation writer's transaction.
const SEED = seedFromEnvironment();
console.log(`g2 cancellation races: ${rerunHint(SEED)}`);
const CANCELLED_REASONS = ['assignment-not-active', 'attempt-not-launchable'];
guardScenarioFile();

type WorkerOverrides = Partial<Omit<ScenarioWorkerOptions, 'name' | 'random'>>;

async function startedWorker(installation: ScenarioInstallation, name: string, random: SeededRandom, overrides: WorkerOverrides = {}) {
  const worker = new ScenarioWorker(installation, {
    name, random, nats: installation.nats, runMilliseconds: 1_000, enrollmentToken: await installation.enrollmentToken(), ...overrides,
  });
  await worker.start();
  await waitFor(() => reachable(installation, worker.workerId), 20_000, 'the worker is reachable');
  return worker;
}

async function firstAssignment(installation: ScenarioInstallation, taskId: string): Promise<AssignmentRow> {
  await waitFor(async () => (await assignmentsOf(installation, taskId)).length > 0, 20_000, 'the first assignment');
  return (await assignmentsOf(installation, taskId))[0]!;
}

// The cancelled assignment wrote no record (W4) and holds no grant, and the
// attempt ran once to its end under a later assignment.
async function assertNeverLaunched(installation: ScenarioInstallation, worker: ScenarioWorker, taskId: string, cancelled: AssignmentRow) {
  assert.ok(journaledUnder(worker, cancelled.assignmentId).every(({ recordWritten }) => !recordWritten), 'no record under the cancelled assignment');
  const executed = await assertExitedOnce(installation, taskId);
  const task = await installation.task(taskId);
  assert.deepEqual(grantsUnder(task, cancelled.assignmentId), [], 'no grant under the cancelled assignment');
  const started = task.attempts[0]!.executions.find((execution) => execution.start !== undefined)!;
  assert.notEqual(started.assignmentId, cancelled.assignmentId, 'a later assignment ran the attempt');
  return executed;
}

// Where the cancel landed: after a proven start, or where the process may
// not have started yet (before the start, or racing the spawn).
type CancelPoint = 'after-start' | 'start-open';

// The attempt ended cancelled; a started process ended by the cancel's
// signal, and no scripted process of the worker remains.
async function assertCancelled(installation: ScenarioInstallation, worker: ScenarioWorker, taskId: string, point: CancelPoint): Promise<string> {
  await installation.ended(taskId);
  const outcome = (await installation.task(taskId)).attempts[0]!.outcome!;
  assert.equal(outcome.cancelled, true, `the attempt ended cancelled: ${JSON.stringify(outcome)}`);
  if (point === 'after-start') {
    assert.equal(outcome.kind, 'exited', `a started process ends exited: ${JSON.stringify(outcome)}`);
    assert.equal(outcome.kind === 'exited' && outcome.startProven, true, 'the start is proven');
  }
  if (outcome.kind === 'exited') assert.deepEqual(outcome.status, { kind: 'signal', signal: CANCEL_SIGNAL });
  await waitFor(() => scriptedProcesses(worker).length === 0, 10_000, 'no scripted process remains');
  return outcome.kind === 'exited' ? `exited by ${CANCEL_SIGNAL}` : outcome.kind;
}

describe('cancellation races', SCENARIO_HOST, () => {
  // Seed: whether the heal comes before or after the control plane marks
  // the worker lost. The offer and the end wait in the worker's stream.
  test('a. a cancel committed before the worker receives the offer launches nothing', { timeout: PARTITION_TIMEOUT_MILLISECONDS }, async () => {
    const random = new SeededRandom(SEED);
    const healAfterLostContact = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'cancel-before-offer', seed: SEED }, () => withPartitions((toxiproxy) => withInstallation({ postgres: 'direct', toxiproxy }, async (installation) => {
      const nats = toxiproxy.proxy('nats');
      const worker = await startedWorker(installation, 'cancel-before-offer', random, { nats: integrationEndpoint('TASKELITH_NATS_PROXY_URL') });
      try {
        await nats.disconnect();
        await installation.submitTask('task-a');
        const cancelled = await firstAssignment(installation, 'task-a');
        await cancelAssignment(installation, cancelled.assignmentId);
        if (healAfterLostContact) await waitFor(async () => !(await reachable(installation, worker.workerId)), 20_000, 'the worker is lost');
        assert.equal(journalOf(worker).intents.length, 0, 'the offer has not reached the worker');
        await nats.heal();
        await waitFor(() => intentEnded(worker, cancelled.assignmentId), 20_000, 'the cancelled intent ends');
        await assertNeverLaunched(installation, worker, 'task-a', cancelled);
        return `healed ${healAfterLostContact ? 'after' : 'before'} lost contact`;
      } finally {
        await worker.stop();
      }
    })));
  });

  // Seed: the request is held before it reaches the authority, or its grant
  // before it reaches the worker; the cancel commits in between.
  test('b. a cancel during authorization prevents W4', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const holdAnswer = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'cancel-during-authorization', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const authority = new OrderedAuthority();
      const gate = new Gate();
      if (holdAnswer) authority.beforeAnswer = gate;
      else authority.beforeRequest = gate;
      const worker = await startedWorker(installation, 'cancel-authorization', random, { authority: authority.wrap });
      try {
        await installation.submitTask('task-b');
        await waitFor(() => authority.sent.length === 1, 20_000, 'the authorization request');
        const cancelled = await firstAssignment(installation, 'task-b');
        if (holdAnswer) await waitFor(async () => grantsUnder(await installation.task('task-b'), cancelled.assignmentId).length === 1, 20_000, 'the grant');
        await cancelAssignment(installation, cancelled.assignmentId);
        if (holdAnswer) {
          await waitFor(() => journalOf(worker).cancellations.length === 1, 20_000, 'the worker journals the cancellation');
          gate.open();
          const how = await assertCancelled(installation, worker, 'task-b', 'start-open');
          assert.equal(journaledUnder(worker, cancelled.assignmentId).at(-1)?.state, 'not-started');
          assert.ok(journaledUnder(worker, cancelled.assignmentId).every(({ recordWritten }) => !recordWritten), 'no W4');
          const [grant] = grantsUnder(await installation.task('task-b'), cancelled.assignmentId);
          assert.equal(grant?.state, 'revoked', 'the cancel revoked the grant');
          return `grant held, then cancelled: ${how}`;
        }
        await waitFor(() => intentEnded(worker, cancelled.assignmentId), 20_000, 'the cancelled intent ends');
        gate.open();
        // The re-placement's request passes the opened gate too and may be
        // answered first, so the held request's answer is found by request.
        const [held] = authority.sent;
        const answerToHeld = () => authority.answered.find(({ request }) => request === held);
        await waitFor(() => answerToHeld() !== undefined, 20_000, 'the answer to the held request');
        const answered = answerToHeld();
        assert.ok(answered!.answer.ok && answered!.answer.value.kind === 'rejected', `the held request is rejected: ${JSON.stringify(answered?.answer)}`);
        const reason = answered!.answer.value.kind === 'rejected' ? answered!.answer.value.rejection.reason : '';
        assert.ok(CANCELLED_REASONS.includes(reason), reason);
        await assertNeverLaunched(installation, worker, 'task-b', cancelled);
        return `request held, then rejected ${reason}; the attempt ran under a later assignment`;
      } finally {
        gate.open();
        await worker.stop();
      }
    }));
  });

  // Seed: the cancel commits once the record is written (W4), or once the
  // start is journaled; the worker forwards it as the cancel file.
  test('c. a cancel after W4 terminates the process through the cancel file', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const afterStart = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'cancel-after-w4', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      // Before the start, the supervisor waits until the cancel is journaled.
      const supervisorHeld = new Gate();
      if (afterStart) supervisorHeld.open();
      const worker = await startedWorker(installation, 'cancel-after-w4', random, {
        runMilliseconds: HELD_RUN, beforeSupervisorStart: () => supervisorHeld.wait('the held supervisor start'),
      });
      try {
        await installation.submitTask('task-c');
        const cancelled = await firstAssignment(installation, 'task-c');
        const latest = () => journaledUnder(worker, cancelled.assignmentId).at(-1);
        const reached = afterStart ? () => latest()?.state === 'started' : () => latest()?.recordWritten === true;
        await waitFor(reached, 20_000, afterStart ? 'the start' : 'W4');
        if (afterStart) assertContained(scriptedPids(worker));
        await cancelAssignment(installation, cancelled.assignmentId);
        const atCancel = latest()!;
        assert.equal(atCancel.recordWritten, true, 'the cancel lands after W4');
        const started = atCancel.state === 'started' || atCancel.state === 'exited';
        assert.equal(started, afterStart, `the cancel lands ${afterStart ? 'after' : 'before'} the start: ${atCancel.state}`);
        await waitFor(() => journalOf(worker).cancellations.length === 1, 20_000, 'the worker journals the cancellation');
        supervisorHeld.open();
        const how = await assertCancelled(installation, worker, 'task-c', afterStart ? 'after-start' : 'start-open');
        return `cancelled after ${afterStart ? 'the start' : 'W4, before the start'} (journal state ${atCancel.state ?? 'none'}): ${how}`;
      } finally {
        supervisorHeld.open();
        await worker.stop();
      }
    }));
  });

  // Seed: how long the pressure lasts after the cancel. The launch waits
  // before W2 under pressure; the cancelled intent never gets a grant.
  test('d. a cancel during the admission-pressure wait launches nothing', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const pressureMilliseconds = random.nextInt(3) * 500;
    await recordScenario({ scenario: 'cancel-during-admission-pressure', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const relieved = new Gate();
      const authority = new OrderedAuthority();
      let worker: ScenarioWorker | undefined;
      // Set while the worker runs, so the journal is read only then.
      let running = false;
      // The disk floor is crossed once the offer is journaled (after W1).
      const pressured = () => running && journalOf(worker!).intents.length > 0 && !relieved.isOpen;
      worker = await startedWorker(installation, 'cancel-pressure', random, { authority: authority.wrap, freeBytes: () => (pressured() ? 0 : 2 ** 50) });
      running = true;
      try {
        await installation.submitTask('task-d');
        await waitFor(() => pressureChanges(worker!).length > 0, 20_000, 'admission pressure');
        assert.equal(authority.sent.length, 0, 'no authorization request under pressure');
        const cancelled = await firstAssignment(installation, 'task-d');
        await cancelAssignment(installation, cancelled.assignmentId);
        await waitFor(() => intentEnded(worker!, cancelled.assignmentId), 20_000, 'the cancelled intent ends');
        await delay(pressureMilliseconds);
        relieved.open();
        await assertNeverLaunched(installation, worker, 'task-d', cancelled);
        return `pressure relieved ${pressureMilliseconds} ms after the cancel; causes ${pressureChanges(worker).join(' then ')}`;
      } finally {
        running = false;
        relieved.open();
        await worker.stop();
      }
    }));
  });

  // Seed: restart before or after the ack wait. The worker dies after W1,
  // before the ack; restarted, it applies it and acks the redelivery.
  test('e. a crash between W1 and the ack of a cancellation is applied once after redelivery', { timeout: 120_000 }, async () => {
    const random = new SeededRandom(SEED);
    const restartAfterAckWait = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'cancel-crash-before-ack', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const name = 'cancel-crash';
      const crashing = await CrashingWorker.start({
        apiUrl: installation.apiUrl.href, base: installation.base, nats: installation.nats.href, name, seed: SEED,
        enrollmentToken: await installation.enrollmentToken(), runMilliseconds: HELD_RUN, commandType: CANCELLATION,
      });
      let worker: ScenarioWorker | undefined;
      try {
        await waitFor(() => reachable(installation, crashing.workerId), 20_000, 'the crashing worker is reachable');
        await installation.submitTask('task-e');
        await waitFor(async () => (await startedExecutions(installation, 'task-e')) === 1, 20_000, 'the start');
        const cancelled = await firstAssignment(installation, 'task-e');
        await cancelAssignment(installation, cancelled.assignmentId);
        assert.equal(await crashing.exited(), 'SIGKILL', 'the worker died between W1 and the ack');
        if (restartAfterAckWait) await delay(SCENARIO_LIMITS.ackWaitMilliseconds + 500);
        let acknowledged = 0;
        worker = new ScenarioWorker(installation, {
          name, random: new SeededRandom(SEED + 1), nats: installation.nats, runMilliseconds: HELD_RUN,
          transport: (transport) => interceptAck(transport, CANCELLATION, (ack) => { acknowledged += 1; ack(); }),
        });
        await worker.start();
        const how = await assertCancelled(installation, worker, 'task-e', 'after-start');
        await waitFor(() => acknowledged === 1, 20_000, 'the redelivered cancellation is acknowledged');
        const { cancellations } = journalOf(worker);
        assert.equal(cancellations.length, 1, 'the cancellation is journaled once');
        await waitFor(() => journalOf(worker!).cancellations[0]!.evidenceRecorded, 20_000, 'the cancellation evidence');
        return `restarted ${restartAfterAckWait ? 'after' : 'before'} the ack wait: ${how}; redelivery acknowledged once`;
      } finally {
        crashing.kill();
        await worker?.stop();
      }
    }));
  });

  // Seed: the offsets at which the held request and the cancel start, each
  // round. Whichever commits first, no grant stays live after the cancel.
  test('f. an invalidation racing a grant leaves no live grant', { timeout: 120_000 }, async () => {
    const random = new SeededRandom(SEED);
    await recordScenario({ scenario: 'invalidation-racing-grant', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const authority = new OrderedAuthority();
      // A refused re-placement can keep the worker ineligible (B5), so each
      // round has its own slot.
      const worker = await startedWorker(installation, 'invalidation-race', random, {
        authority: authority.wrap, runMilliseconds: HELD_RUN, slots: RACE_ROUNDS + 1,
      });
      const outcomes: string[] = [];
      try {
        for (let round = 0; round < RACE_ROUNDS; round += 1) {
          const taskId = `task-f-${round}`;
          worker.holdScriptedProcesses();
          const gate = new Gate();
          authority.beforeRequest = gate;
          const sent = authority.sent.length;
          await installation.submitTask(taskId);
          await waitFor(() => authority.sent.length > sent, 20_000, `round ${round}: the request`);
          const held = authority.sent[sent];
          const cancelled = await firstAssignment(installation, taskId);
          const [requestOffset, cancelOffset] = [random.nextInt(RACE_WINDOW_MILLISECONDS), random.nextInt(RACE_WINDOW_MILLISECONDS)];
          await Promise.all([
            delay(requestOffset).then(() => gate.open()),
            delay(cancelOffset).then(() => cancelAssignment(installation, cancelled.assignmentId)),
          ]);
          // A re-placement's request may be answered first, as in scenario b.
          const answerToHeld = () => authority.answered.find(({ request }) => request === held);
          await waitFor(() => answerToHeld() !== undefined, 20_000, `round ${round}: the answer`);
          const { answer } = answerToHeld()!;
          const grants = grantsUnder(await installation.task(taskId), cancelled.assignmentId);
          assert.ok(grants.every(({ state }) => state === 'revoked'), `round ${round}: no live grant: ${JSON.stringify(grants)}`);
          outcomes.push(`${requestOffset}/${cancelOffset} ms: ${await settleRace(installation, worker, taskId, answer.ok ? answer.value.kind : 'failed')}`);
        }
        return outcomes.join('; ');
      } finally {
        authority.beforeRequest.open();
        await worker.stop();
      }
    }));
  });

  // Guards the B3 (#300) and B5 (#316) fixes: a rejected launch frees its
  // slot, and its stale rejection clears the capacity refusal.
  test('a launch rejected after a cancel frees its worker slot (B3)', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    await recordScenario({ scenario: 'rejected-launch-frees-slot', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const authority = new OrderedAuthority();
      const gate = new Gate();
      authority.beforeRequest = gate;
      const worker = await startedWorker(installation, 'rejected-slot', random, { authority: authority.wrap, slots: 1 });
      try {
        await installation.submitTask('task-slot');
        await waitFor(() => authority.sent.length === 1, 20_000, 'the authorization request');
        const cancelled = await firstAssignment(installation, 'task-slot');
        await cancelAssignment(installation, cancelled.assignmentId);
        await waitFor(() => intentEnded(worker, cancelled.assignmentId), 20_000, 'the cancelled intent ends');
        gate.open();
        await assertNeverLaunched(installation, worker, 'task-slot', cancelled);
        return 'the one slot was free again for the re-placement';
      } finally {
        gate.open();
        await worker.stop();
      }
    }));
  });

  test('g. an adopting macOS supervisor does not apply a cancel', {
    skip: 'N/A on Linux: adoption is macOS observe-only; native acceptance item 25 covers it',
  }, () => undefined);

  // Guards the B2 fix (#304): a cancel naming one execution stops only it.
  test('h. an unauthorized start cancels only that execution', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    await recordScenario({ scenario: 'unauthorized-start-cancels-only-that-execution', seed: SEED }, () => withInstallation({ postgres: 'direct' }, async (installation) => {
      const worker = await startedWorker(installation, 'unauthorized-start', random, { runMilliseconds: 6_000 });
      try {
        await installation.submitTask('task-h');
        await waitFor(async () => (await startedExecutions(installation, 'task-h')) === 1, 20_000, 'the authorized start');
        assertContained(scriptedPids(worker));
        const forged = forgeStartUnderOwningGrant(worker, await installation.task('task-h'));
        await waitFor(async () => (await cancellationsTo(installation, worker)).length === 1, 20_000, 'the cancellation of the unauthorized start');
        assert.deepEqual((await cancellationsTo(installation, worker))[0]!.executionId, forged, 'it names only that execution');
        assert.equal((await installation.task('task-h')).attempts[0]!.cancellation, undefined, 'the attempt is not cancelled');
        const executed = await assertExitedOnce(installation, 'task-h');
        return `cancellation for ${forged} only; the owning execution exited 0 (${executed.executions} executions)`;
      } finally {
        await worker.stop();
      }
    }));
  });
});

const CANCELLATION = 'execution.cancellation.request';
const RACE_ROUNDS = 3;
const RACE_WINDOW_MILLISECONDS = 25;

// A round ends with its task: granted, the revoked grant is cancelled
// before or after the spawn; otherwise a released run ends it elsewhere.
async function settleRace(installation: ScenarioInstallation, worker: ScenarioWorker, taskId: string, answer: string): Promise<string> {
  if (answer === 'granted') return `granted then revoked, ${await assertCancelled(installation, worker, taskId, 'start-open')}`;
  worker.releaseScriptedProcesses();
  await assertExitedOnce(installation, taskId);
  return `${answer}, ran under a later assignment`;
}

// Test-side journal writes of the worker's own modules: W2 to W5s for a new
// execution under the owning grant, which is bound to another execution.
function forgeStartUnderOwningGrant(worker: ScenarioWorker, task: Task): ExecutionId {
  const { journal } = worker.running.root;
  const [intent] = journalOf(worker).intents;
  const grant = task.attempts[0]!.executions[0]!.grants[0]!;
  const forged = 'e0000000-0000-4000-8000-0000000000f1' as ExecutionId;
  const operationId = 'e0000000-0000-4000-8000-0000000000f2' as typeof grant.operationId;
  const { recoveryEpoch, assignmentId, attemptId, ownershipGeneration, admissionId, admissionGeneration } = intent!;
  value(journal.beginAuthorization({
    operationId, workerId: journal.binding.workerId, recoveryEpoch, assignmentId, attemptId, ownershipGeneration,
    executionId: forged, admissionId, admissionGeneration, reportsNotStarted: false,
  }));
  value(journal.recordGrant({ ...grant, operationId, executionId: forged }));
  value(journal.recordExecutionRecordWritten(forged));
  const process = { platform: 'linux' as const, bootId: 'forged', pid: 2 ** 22, startTime: 1, processGroupId: 2 ** 22 };
  value(journal.recordStart(forged, grant.launchAuthId as LaunchAuthId, process));
  return forged;
}

async function cancellationsTo(installation: ScenarioInstallation, worker: ScenarioWorker): Promise<{ executionId?: string }[]> {
  return (await installation.commandsTo(worker.workerId)).filter(({ type }) => type === CANCELLATION).map(({ payload }) => payload);
}

function pressureChanges(worker: ScenarioWorker): string[] {
  return worker.logs.records.filter(({ event, fields }) => event === 'worker.admission-pressure.changed' && fields.causes !== '')
    .map(({ fields }) => String(fields.causes));
}

function scriptedProcesses(worker: ScenarioWorker) {
  return processesNaming(worker.dataRoot).filter(({ commandLine }) => commandLine.includes('setTimeout'));
}

function scriptedPids(worker: ScenarioWorker): number[] {
  return scriptedProcesses(worker).map(({ pid }) => pid);
}
