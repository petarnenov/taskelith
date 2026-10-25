import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeLaunch,
  decideStartObservation,
  endAttempt,
  recordExit,
  recordNotStarted,
  recordStartObservation,
  type StartContext,
  type StartObservation,
} from '@taskelith/execution';
import {
  EPOCH,
  EXECUTION,
  OTHER_WORKER,
  T2,
  T3,
  T4,
  WORKER,
  authorized,
  epoch,
  executionId,
  failureOf,
  grantIssue,
  launchAuthId,
  launchContext,
  launchRequest,
  operationId,
  placedTask,
  value,
} from './fixtures.ts';

const INSTALLATION = { recoveryEpoch: EPOCH, quarantined: false };

function observation(overrides: Partial<StartObservation> = {}): StartObservation {
  return { workerId: WORKER, launchAuthId: launchAuthId('launch-1'), executionId: EXECUTION, recoveryEpoch: EPOCH, ...overrides };
}

test('a start under the owning execution\'s grant moves it to started, however late it arrives', () => {
  const { task, grant } = authorized();
  const recorded = value(recordStartObservation(task, observation(), { installation: INSTALLATION, grant }, T4));
  assert.equal(recorded.decision, 'started');
  const execution = recorded.task.attempts[0]!.executions[0]!;
  assert.equal(execution.state, 'started');
  assert.deepEqual(execution.start, { kind: 'current', launchAuthId: 'launch-1', recordedAt: T4 });
});

test('a duplicate start returns the recorded fact and changes nothing', () => {
  const { task, grant } = authorized();
  const first = value(recordStartObservation(task, observation(), { installation: INSTALLATION, grant }, T2));
  const exited = value(recordExit(first.task, { workerId: WORKER, executionId: EXECUTION, status: { kind: 'code', code: 1 }, startProven: true, spawnFailed: false }, T3)).task;
  const repeated = value(recordStartObservation(exited, observation(), { installation: INSTALLATION, grant }, T4));
  assert.equal(repeated.decision, 'duplicate');
  assert.equal(repeated.task, exited);
});

test('a start under an expired or revoked grant of the owning execution is still a start', () => {
  const { task, grant } = authorized();
  const revoked = { ...grant, state: 'revoked' as const, revokedFor: 'policy-revision-changed' as const };
  assert.equal(decideStartObservation(observation(), { installation: INSTALLATION, grant: revoked, task }), 'started');
});

test('another worker\'s grant or execution is foreign and writes nothing', () => {
  const { task, grant } = authorized();
  assert.equal(decideStartObservation(observation({ workerId: OTHER_WORKER }), { installation: INSTALLATION, grant, task }), 'foreign');
  assert.equal(decideStartObservation(observation({ workerId: OTHER_WORKER }), { installation: INSTALLATION, task }), 'foreign');
  const recorded = value(recordStartObservation(task, observation({ workerId: OTHER_WORKER }), { installation: INSTALLATION, grant }, T2));
  assert.equal(recorded.decision, 'foreign');
  assert.equal(recorded.task, task);
});

test('a start from another recovery epoch or in quarantine is kept as evidence and changes no state', () => {
  const { task, grant } = authorized();
  const older = decideStartObservation(observation({ recoveryEpoch: epoch(2) }), { installation: { recoveryEpoch: epoch(3), quarantined: false }, grant, task });
  assert.equal(older, 'quarantine-evidence');
  assert.equal(decideStartObservation(observation({ recoveryEpoch: epoch(2) }), { installation: INSTALLATION, grant, task }), 'quarantine-evidence');
  assert.equal(decideStartObservation(observation(), { installation: { recoveryEpoch: EPOCH, quarantined: true } }), 'quarantine-evidence');
  const recorded = value(recordStartObservation(task, observation(), { installation: { recoveryEpoch: EPOCH, quarantined: true }, grant }, T2));
  assert.equal(recorded.task, task);
});

test('a start of an exited execution is history, with or without a later execution', () => {
  const { task, grant } = authorized();
  const exited = value(recordExit(task, { workerId: WORKER, executionId: EXECUTION, status: { kind: 'unknown' }, startProven: false, spawnFailed: false }, T2)).task;
  const nextRequest = launchRequest(exited, { executionId: executionId('execution-2'), operationId: operationId('operation-2') });
  const withB = value(authorizeLaunch(exited, nextRequest, launchContext(exited), grantIssue('launch-2', T3))).task;
  const late = value(recordStartObservation(withB, observation(), { installation: INSTALLATION, grant }, T4));
  assert.equal(late.decision, 'historical');
  const attempt = late.task.attempts[0]!;
  assert.deepEqual(attempt.executions.map((execution) => execution.state), ['exited', 'authorized']);
  assert.equal(attempt.executions[1]!.start, undefined);
});

test('a start under an unknown grant, another execution\'s grant, or after not-started is unauthorized', () => {
  const { task, grant } = authorized();
  assert.equal(decideStartObservation(observation(), { installation: INSTALLATION, task }), 'unauthorized-start');
  const otherGrant = { ...grant, executionId: executionId('execution-9') };
  assert.equal(decideStartObservation(observation(), { installation: INSTALLATION, grant: otherGrant, task }), 'unauthorized-start');
  assert.equal(decideStartObservation(observation({ executionId: executionId('execution-9') }), { installation: INSTALLATION, grant }), 'unauthorized-start');
  const sealed = value(recordNotStarted(task, { workerId: WORKER, executionId: EXECUTION }, T2)).task;
  const recorded = value(recordStartObservation(sealed, observation(), { installation: INSTALLATION, grant }, T3));
  assert.equal(recorded.decision, 'unauthorized-start');
  const execution = recorded.task.attempts[0]!.executions[0]!;
  assert.equal(execution.state, 'not-started');
  assert.equal(execution.start?.kind, 'unauthorized');
});

test('a start of an execution the task does not hold is not recorded on it', () => {
  const task = value(endAttempt(placedTask(), placedTask().attempts[0]!.id, T2));
  assert.equal(failureOf(recordStartObservation(task, observation(), { installation: INSTALLATION }, T2)).code, 'not-found');
});
