import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import {
  planJournalRecovery,
  type AuthorizationOutcome,
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

test('a final rejection stops the launch, after a grant or before a W6', () => {
  assert.deepEqual(plan([execution(['granted', 'rejected-final'], 'authorized')]), [seal]);
  assert.deepEqual(plan([execution(['rejected-final'], 'not-started')]), []);
});

test('a granted execution whose re-authorization was rejected is sealed and relaunched', () => {
  assert.deepEqual(plan([execution(['granted', 'rejected-retryable'], 'authorized')]), [seal, continueLaunch]);
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
