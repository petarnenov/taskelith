import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import {
  parseRecoveryEpoch,
  planJournalRecovery,
  REPORTED_SEALS_LIMIT,
  unconfirmedSealedExecutions,
  type AuthorizationOutcome,
  type ExecutionId,
  type ExecutionState,
  type JournaledCancellation,
  type JournaledExecution,
  type JournaledIntent,
  type JournalSnapshot,
  type RecoveryAction,
} from '@taskelith/execution';
import { id, value } from '@taskelith/testing';

const INTENT: JournaledIntent = {
  assignmentId: id('AssignmentId', 'assignment-1'),
  attemptId: id('AttemptId', 'attempt-1'),
  ownershipGeneration: value(parseOwnershipGeneration(1)),
  admissionId: id('AdmissionId', 'admission-1'),
  admissionGeneration: value(parseGeneration(1)),
  recoveryEpoch: value(parseRecoveryEpoch(1)),
  requested: { cpuMillicores: 1000, memoryMebibytes: 1024, hardControls: [] },
  commandId: id('CommandId', 'offer-1'),
  ended: false,
};
const EXECUTION = id('ExecutionId', 'execution-1');
const COMMAND = id('CommandId', 'cancel-1');

function execution(outcomes: AuthorizationOutcome[], state?: ExecutionState, recordWritten = false): JournaledExecution {
  return {
    executionId: EXECUTION,
    assignmentId: INTENT.assignmentId,
    ...(state === undefined ? {} : { state }),
    recordWritten,
    uncertain: false,
    authorizations: outcomes.map((outcome, index) => ({ operationId: id('OperationId', `operation-${index}`), outcome })),
  };
}

function plan(executions: JournaledExecution[], cancellations: JournaledCancellation[] = [], intent = INTENT): readonly RecoveryAction[] {
  const snapshot: JournalSnapshot = { intents: [intent], cancellations, executions };
  return planJournalRecovery(snapshot);
}

const continueLaunch: RecoveryAction = { kind: 'continue-launch', assignmentId: INTENT.assignmentId };
const seal: RecoveryAction = { kind: 'seal-execution', executionId: EXECUTION };
const attemptCancellation = (evidenceRecorded: boolean): JournaledCancellation => ({
  commandId: COMMAND,
  target: { kind: 'attempt', attemptId: INTENT.attemptId },
  evidenceRecorded,
});

test('an accepted launch intent without an execution continues the launch', () => {
  assert.deepEqual(plan([]), [continueLaunch]);
});

test('an ended assignment is neither launched nor retried', () => {
  const ended = { ...INTENT, ended: true };
  assert.deepEqual(plan([], [], ended), []);
  assert.deepEqual(plan([execution(['rejected-retryable'])], [], ended), []);
  assert.deepEqual(plan([execution(['pending'])], [], ended), [seal]);
});

test('a W2 without an outcome, or a grant without W4, is sealed and relaunched', () => {
  assert.deepEqual(plan([execution(['pending'])]), [seal, continueLaunch]);
  assert.deepEqual(plan([execution(['granted'], 'authorized')]), [seal, continueLaunch]);
});

test('a retryable rejection is retried for the same execution, a final one is not', () => {
  assert.deepEqual(plan([execution(['rejected-retryable'])]), [{ kind: 'retry-authorization', executionId: EXECUTION }]);
  assert.deepEqual(plan([execution(['rejected-retryable', 'rejected-final'])]), []);
});

test('an expired operation is authorized again for the same execution', () => {
  assert.deepEqual(plan([execution(['expired'])]), [{ kind: 'retry-authorization', executionId: EXECUTION }]);
  assert.deepEqual(plan([execution(['expired', 'rejected-final'])]), []);
});

test('a final rejection stops the launch, after a grant or before a W6', () => {
  assert.deepEqual(plan([execution(['granted', 'rejected-final'], 'authorized')]), [seal]);
  assert.deepEqual(plan([execution(['rejected-final'], 'not-started')]), []);
});

test('a granted execution with a later rejected or expired operation is sealed and relaunched', () => {
  assert.deepEqual(plan([execution(['granted', 'rejected-retryable'], 'authorized')]), [seal, continueLaunch]);
  assert.deepEqual(plan([execution(['granted', 'expired'], 'authorized')]), [seal, continueLaunch]);
});

test('W4 or W5s without a terminal fact goes to the execution record recovery', () => {
  const recover: RecoveryAction = { kind: 'recover-execution-record', executionId: EXECUTION };
  assert.deepEqual(plan([execution(['granted'], 'authorized', true)]), [recover]);
  assert.deepEqual(plan([execution(['granted'], 'started', true)]), [recover]);
});

test('W5e repeats nothing, and executions that all did not start launch again', () => {
  assert.deepEqual(plan([execution(['granted'], 'exited', true)]), []);
  assert.deepEqual(plan([execution(['granted'], 'not-started')]), [continueLaunch]);
});

test('a cancellation is forwarded until its evidence is recorded and stops the launch', () => {
  assert.deepEqual(plan([], [attemptCancellation(false)]), [{ kind: 'forward-cancellation', commandId: COMMAND, target: attemptCancellation(false).target }]);
  assert.deepEqual(plan([], [attemptCancellation(true)]), []);
  assert.deepEqual(plan([execution(['rejected-retryable'])], [attemptCancellation(true)]), []);
});

test('a cancelled execution with an unused grant is sealed and not relaunched', () => {
  const cancellation: JournaledCancellation = { commandId: COMMAND, target: { kind: 'execution', executionId: EXECUTION }, evidenceRecorded: true };
  assert.deepEqual(plan([execution(['granted'], 'authorized')], [cancellation]), [seal]);
});

const SUPERSEDED = id('ExecutionId', 'execution-0');
const superseded: JournaledExecution = { ...execution(['granted'], 'not-started'), executionId: SUPERSEDED };
const executionCancellation = (executionId: ExecutionId): JournaledCancellation => ({
  commandId: COMMAND,
  target: { kind: 'execution', executionId },
  evidenceRecorded: true,
});

test('a cancellation of a superseded execution leaves the last one to be retried or relaunched', () => {
  const cancellation = executionCancellation(SUPERSEDED);
  assert.deepEqual(plan([superseded, execution(['rejected-retryable'])], [cancellation]), [{ kind: 'retry-authorization', executionId: EXECUTION }]);
  assert.deepEqual(plan([superseded, execution(['pending'])], [cancellation]), [seal, continueLaunch]);
  assert.deepEqual(plan([superseded, execution(['granted'], 'not-started')], [cancellation]), [continueLaunch]);
});

test('a cancelled last execution sealed before its start ends the intent', () => {
  const cancellation = executionCancellation(EXECUTION);
  assert.deepEqual(plan([superseded, execution(['granted'], 'not-started')], [cancellation]), []);
  assert.deepEqual(plan([superseded, execution(['granted'], 'authorized')], [cancellation]), [seal]);
  assert.deepEqual(plan([superseded, execution(['rejected-retryable'])], [cancellation]), []);
});

test('an attempt cancellation still stops every execution of its intent', () => {
  assert.deepEqual(plan([superseded, execution(['pending'])], [attemptCancellation(true)]), [seal]);
  assert.deepEqual(plan([superseded, execution(['rejected-retryable'])], [attemptCancellation(true)]), []);
});

function unconfirmed(executions: JournaledExecution[]) {
  const snapshot: JournalSnapshot = { intents: [INTENT], cancellations: [], executions };
  return unconfirmedSealedExecutions(snapshot, INTENT.assignmentId);
}

function numbered(index: number, outcomes: AuthorizationOutcome[], state?: ExecutionState): JournaledExecution {
  return { ...execution(outcomes, state), executionId: id('ExecutionId', `execution-${index}`) };
}

test('each unconfirmed sealed execution is reported with its last granted, else last, operation', () => {
  const later = numbered(2, ['expired', 'expired'], 'not-started');
  const other = { ...numbered(3, ['pending'], 'not-started'), assignmentId: id('AssignmentId', 'assignment-2') };
  assert.deepEqual(unconfirmed([execution(['expired', 'granted', 'expired'], 'not-started'), later, other]), [
    { executionId: EXECUTION, operationId: 'operation-1' },
    { executionId: 'execution-2', operationId: 'operation-1' },
  ]);
  assert.deepEqual(unconfirmed([execution(['granted'], 'exited')]), []);
  assert.deepEqual(unconfirmed([execution([], 'not-started')]), []);
  assert.deepEqual(unconfirmed([]), []);
});

test('a grant of a later execution confirms every sealed one journaled before it', () => {
  const runtimeSeal = [numbered(1, ['granted'], 'not-started'), numbered(2, ['expired'], 'not-started')];
  assert.deepEqual(unconfirmed(runtimeSeal).map(({ executionId }) => executionId), ['execution-1', 'execution-2']);
  const confirmed = [numbered(1, ['pending'], 'not-started'), numbered(2, ['granted'], 'not-started'), numbered(3, ['expired'], 'not-started')];
  assert.deepEqual(unconfirmed(confirmed).map(({ executionId }) => executionId), ['execution-2', 'execution-3']);
  const resumed = [numbered(1, ['granted'], 'not-started'), numbered(2, ['granted'], 'started')];
  assert.deepEqual(unconfirmed(resumed), []);
});

test('at most REPORTED_SEALS_LIMIT unconfirmed sealed executions are reported, the oldest first', () => {
  const sealed = Array.from({ length: REPORTED_SEALS_LIMIT + 2 }, (_, index) => numbered(index + 1, ['expired'], 'not-started'));
  const reported = unconfirmed(sealed).map(({ executionId }) => executionId);
  assert.deepEqual(reported, sealed.slice(0, REPORTED_SEALS_LIMIT).map(({ executionId }) => executionId));
});
