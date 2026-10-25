import assert from 'node:assert/strict';
import test from 'node:test';
import { useAdmission } from '@taskelith/sdlc';
import {
  ATTEMPT_PHASES,
  ATTEMPT_PHASE_TRANSITIONS,
  activeAttempt,
  attemptPhase,
  canResendAssignment,
  claimOwnership,
  endAttempt,
  executionsUnderAssignment,
  openAttempt,
  openTask,
  rebindAdmission,
  recordExecutionEvidence,
  recordExit,
  recordNotStarted,
  recordStartObservation,
  requestCancellation,
  resolveByOperator,
  taskOutcomeFact,
  type ExitReport,
  type Task,
} from '@taskelith/execution';
import {
  ASSIGNMENT,
  ATTEMPT,
  EPOCH,
  EXECUTION,
  OTHER_WORKER,
  T0,
  T1,
  T2,
  T3,
  T4,
  WORKER,
  admittedImplementation,
  assignmentId,
  attemptId,
  authorized,
  evidence,
  executionId,
  failureOf,
  implementationAdmission,
  ownership,
  placedTask,
  value,
} from './fixtures.ts';

const REPORT = { workerId: WORKER, executionId: EXECUTION };
const CLEAN_EXIT: ExitReport = { ...REPORT, status: { kind: 'code', code: 0 }, startProven: true, spawnFailed: false };
const INSTALLATION = { recoveryEpoch: EPOCH, quarantined: false };

function started(): Task {
  const { task, grant } = authorized();
  const observation = { workerId: WORKER, launchAuthId: grant.launchAuthId, executionId: EXECUTION, recoveryEpoch: EPOCH };
  return value(recordStartObservation(task, observation, { installation: INSTALLATION, grant }, T2)).task;
}

test('a task starts at the ownership generation its admission was dispatched at', () => {
  const task = value(openTask(implementationAdmission('admission-1', ownership(4)), T0));
  assert.equal(task.ownershipGeneration, 4);
  assert.equal(task.generation, 1);
  assert.deepEqual(task.attempts, []);
  assert.ok(Object.isFrozen(task));
});

test('an admission dispatched without an ownership generation opens no task', () => {
  const admitted = admittedImplementation();
  assert.equal(failureOf(openTask(admitted, T0)).code, 'precondition-failed');
  const unfenced = value(useAdmission(admitted, admitted.generation, T0));
  assert.equal(failureOf(openTask(unfenced, T0)).code, 'precondition-failed');
});

test('a task has at most one active attempt, and every owner change raises the ownership generation', () => {
  const task = value(openTask(implementationAdmission(), T0));
  const attempted = value(openAttempt(task, ownership(1), { id: ATTEMPT }, T0));
  assert.equal(attempted.ownershipGeneration, 2);
  assert.equal(activeAttempt(attempted)?.id, ATTEMPT);
  const second = failureOf(openAttempt(attempted, ownership(2), { id: attemptId('attempt-2') }, T0));
  assert.equal(second.code, 'precondition-failed');
  const placed = value(claimOwnership(attempted, ownership(2), ATTEMPT, T0));
  assert.equal(placed.ownershipGeneration, 3);
});

test('a stale ownership generation is rejected with its reason before anything else', () => {
  const task = placedTask();
  const stale = failureOf(claimOwnership(task, ownership(2), ATTEMPT, T1));
  assert.equal(stale.code, 'conflict');
  assert.equal(stale.details.reason, 'stale-ownership-generation');
  assert.equal(failureOf(openAttempt(task, ownership(2), { id: attemptId('attempt-2') }, T1)).details.reason, 'stale-ownership-generation');
});

test('ownership does not move while an execution of the attempt can run', () => {
  const { task } = authorized();
  assert.equal(failureOf(claimOwnership(task, task.ownershipGeneration, ATTEMPT, T2)).code, 'precondition-failed');
  const cancelled = value(requestCancellation(placedTask(), ATTEMPT, 'requested', T1));
  assert.equal(failureOf(claimOwnership(cancelled, cancelled.ownershipGeneration, ATTEMPT, T1)).code, 'precondition-failed');
});

test('a retry names an ended attempt of the task, and attempt identities are unique', () => {
  const task = value(endAttempt(placedTask(), ATTEMPT, T1));
  assert.equal(failureOf(openAttempt(task, task.ownershipGeneration, { id: ATTEMPT }, T1)).code, 'conflict');
  const unknown = { id: attemptId('attempt-2'), retryOf: attemptId('attempt-9') };
  assert.equal(failureOf(openAttempt(task, task.ownershipGeneration, unknown, T1)).code, 'not-found');
  const retried = value(openAttempt(task, task.ownershipGeneration, { id: attemptId('attempt-2'), retryOf: ATTEMPT }, T1));
  assert.equal(retried.attempts[1]!.retryOf, ATTEMPT);
});

test('re-admission binds an admission dispatched at the next ownership generation while no attempt is active', () => {
  const task = value(openTask(implementationAdmission(), T0));
  const readmitted = value(rebindAdmission(task, implementationAdmission('admission-2', ownership(2)), T1));
  assert.equal(readmitted.admissionId, 'admission-2');
  assert.equal(readmitted.ownershipGeneration, 2);
  assert.equal(failureOf(rebindAdmission(task, implementationAdmission('admission-2', ownership(3)), T1)).details.reason, 'stale-ownership-generation');
  const placed = placedTask();
  assert.equal(failureOf(rebindAdmission(placed, implementationAdmission('admission-2', ownership(4)), T1)).code, 'precondition-failed');
  const otherAdmission = admittedImplementation('admission-2', 'task-9');
  const otherTask = value(useAdmission(otherAdmission, otherAdmission.generation, T1, ownership(2)));
  assert.equal(failureOf(rebindAdmission(task, otherTask, T1)).code, 'precondition-failed');
});

test('assignment acceptance, start, exit, and the task outcome are distinct facts', () => {
  const running = started();
  assert.equal(attemptPhase(running.attempts[0]!), 'running');
  const exited = value(recordExit(running, CLEAN_EXIT, T3)).task;
  assert.equal(attemptPhase(exited.attempts[0]!), 'awaiting-launch');
  assert.equal(failureOf(taskOutcomeFact(exited, ATTEMPT)).code, 'precondition-failed');
  const ended = value(endAttempt(exited, ATTEMPT, T4));
  const fact = value(taskOutcomeFact(ended, ATTEMPT));
  assert.deepEqual(fact.outcome, { kind: 'exited', executionId: EXECUTION, status: { kind: 'code', code: 0 }, startProven: true, cancelled: false, endedAt: T4 });
  assert.equal(fact.taskId, 'task-1');
  assert.equal(failureOf(taskOutcomeFact(ended, attemptId('attempt-9'))).code, 'not-found');
});

test('an attempt without an exit ends as not-started', () => {
  const ended = value(endAttempt(placedTask(), ATTEMPT, T1));
  assert.deepEqual(ended.attempts[0]!.outcome, { kind: 'not-started', cancelled: false, endedAt: T1 });
  assert.equal(failureOf(endAttempt(ended, ATTEMPT, T1)).code, 'precondition-failed');
  assert.equal(failureOf(endAttempt(started(), ATTEMPT, T3)).code, 'precondition-failed');
});

test('a cancellation request is not termination: the attempt ends only once nothing can run', () => {
  const running = started();
  const requested = value(requestCancellation(running, ATTEMPT, 'requested', T3));
  assert.equal(attemptPhase(requested.attempts[0]!), 'running');
  assert.equal(failureOf(requestCancellation(requested, ATTEMPT, 'requested', T3)).code, 'precondition-failed');
  const terminated = value(recordExit(requested, { ...CLEAN_EXIT, status: { kind: 'signal', signal: 'SIGTERM' } }, T4)).task;
  const outcome = terminated.attempts[0]!.outcome;
  assert.equal(outcome?.kind, 'exited');
  assert.equal(outcome?.cancelled, true);
});

test('cancelling an attempt with nothing running ends it at once', () => {
  const cancelled = value(requestCancellation(placedTask(), ATTEMPT, 'requested', T1));
  assert.deepEqual(cancelled.attempts[0]!.outcome, { kind: 'not-started', cancelled: true, endedAt: T1 });
  const sealed = value(requestCancellation(authorized().task, ATTEMPT, 'assignment-ended', T2));
  const notStarted = value(recordNotStarted(sealed, REPORT, T3)).task;
  assert.deepEqual(notStarted.attempts[0]!.outcome, { kind: 'not-started', cancelled: true, endedAt: T3 });
});

test('execution facts are accepted by version: duplicates change nothing and terminal facts never regress', () => {
  const running = started();
  const exited = value(recordExit(running, CLEAN_EXIT, T3));
  assert.equal(exited.effect, 'applied');
  const repeated = value(recordExit(exited.task, { ...CLEAN_EXIT, status: { kind: 'unknown' } }, T4));
  assert.equal(repeated.effect, 'duplicate');
  assert.equal(repeated.task, exited.task);
  assert.equal(failureOf(recordNotStarted(exited.task, REPORT, T4)).code, 'precondition-failed');
  const sealed = value(recordNotStarted(authorized().task, REPORT, T3)).task;
  assert.equal(value(recordNotStarted(sealed, REPORT, T4)).effect, 'duplicate');
  assert.equal(failureOf(recordExit(sealed, CLEAN_EXIT, T4)).code, 'precondition-failed');
  assert.equal(failureOf(recordNotStarted(running, REPORT, T3)).code, 'precondition-failed');
});

test('an exit before its start is recorded, with the start unproven, and the late start stays history', () => {
  const { task, grant } = authorized();
  const exited = value(recordExit(task, { ...REPORT, status: { kind: 'unknown' }, startProven: false, spawnFailed: true }, T2)).task;
  assert.equal(exited.attempts[0]!.executions[0]!.state, 'exited');
  const observation = { workerId: WORKER, launchAuthId: grant.launchAuthId, executionId: EXECUTION, recoveryEpoch: EPOCH };
  const late = value(recordStartObservation(exited, observation, { installation: INSTALLATION, grant }, T3));
  assert.equal(late.decision, 'historical');
  assert.equal(late.task.attempts[0]!.executions[0]!.state, 'exited');
  assert.equal(late.task.attempts[0]!.executions[0]!.start?.kind, 'historical');
});

test('only the execution\'s worker reports its facts, and an unknown execution is not found', () => {
  const { task } = authorized();
  assert.equal(failureOf(recordExit(task, { ...CLEAN_EXIT, workerId: OTHER_WORKER }, T2)).code, 'forbidden');
  assert.equal(failureOf(recordNotStarted(task, { ...REPORT, executionId: executionId('execution-9') }, T2)).code, 'not-found');
});

test('uncertainty and an unproven termination are kept beside the state, which they leave unchanged', () => {
  const running = started();
  const uncertain = value(recordExecutionEvidence(running, { ...REPORT, kind: 'uncertain' }, T3)).task;
  const unproven = value(recordExecutionEvidence(uncertain, { ...REPORT, kind: 'termination-unproven' }, T4)).task;
  const execution = unproven.attempts[0]!.executions[0]!;
  assert.equal(execution.state, 'started');
  assert.deepEqual(execution.evidence.map((item) => item.kind), ['uncertain', 'termination-unproven']);
  assert.equal(failureOf(endAttempt(unproven, ATTEMPT, T4)).code, 'precondition-failed');
  const exited = value(recordExit(running, CLEAN_EXIT, T3)).task;
  assert.equal(failureOf(recordExecutionEvidence(exited, { ...REPORT, kind: 'uncertain' }, T4)).code, 'precondition-failed');
});

test('an operator reconciliation ends an uncertain execution with an unknown status and the attempt', () => {
  const uncertain = value(recordExecutionEvidence(started(), { ...REPORT, kind: 'uncertain' }, T3)).task;
  const resolved = value(resolveByOperator(uncertain, ATTEMPT, evidence('incident-7'), T4));
  const attempt = resolved.attempts[0]!;
  const execution = attempt.executions[0]!;
  assert.equal(execution.state, 'exited');
  assert.deepEqual(execution.exit?.status, { kind: 'unknown' });
  assert.equal(execution.exit?.startProven, true);
  assert.equal(execution.grants[0]!.state, 'revoked');
  assert.deepEqual(attempt.outcome, { kind: 'operator-resolved', executionId: EXECUTION, evidence: 'incident-7', cancelled: false, endedAt: T4 });
  assert.equal(failureOf(resolveByOperator(placedTask(), ATTEMPT, evidence('incident-7'), T4)).code, 'precondition-failed');
});

test('the scheduler reads whether an assignment ever had a grant and whether an execution can run', () => {
  const placed = placedTask();
  assert.deepEqual(executionsUnderAssignment(placed, ASSIGNMENT), { granted: false, nonTerminal: false });
  assert.deepEqual(executionsUnderAssignment(authorized().task, ASSIGNMENT), { granted: true, nonTerminal: true });
  const sealed = value(recordNotStarted(authorized().task, REPORT, T3)).task;
  assert.deepEqual(executionsUnderAssignment(sealed, ASSIGNMENT), { granted: true, nonTerminal: false });
  assert.deepEqual(executionsUnderAssignment(sealed, assignmentId('assignment-2')), { granted: false, nonTerminal: false });
});

test('after lost local history a command is sent again only while no grant was recorded', () => {
  assert.equal(canResendAssignment(placedTask(), ATTEMPT), true);
  assert.equal(canResendAssignment(authorized().task, ATTEMPT), false);
  assert.equal(canResendAssignment(placedTask(), attemptId('attempt-9')), false);
  const lost = value(recordExecutionEvidence(authorized().task, { ...REPORT, kind: 'local-history-lost' }, T3)).task;
  assert.equal(lost.attempts[0]!.executions[0]!.state, 'authorized');
});

test('the attempt phase table lists exactly the phase changes, and an ended attempt changes no more', () => {
  assert.deepEqual(Object.keys(ATTEMPT_PHASE_TRANSITIONS), [...ATTEMPT_PHASES]);
  assert.deepEqual(ATTEMPT_PHASE_TRANSITIONS.ended, []);
  const ended = value(endAttempt(placedTask(), ATTEMPT, T1));
  assert.equal(failureOf(requestCancellation(ended, ATTEMPT, 'requested', T1)).code, 'precondition-failed');
  assert.equal(failureOf(claimOwnership(ended, ended.ownershipGeneration, ATTEMPT, T1)).code, 'precondition-failed');
});

test('transitions are deterministic for the same input', () => {
  assert.deepEqual(authorized(), authorized());
  assert.deepEqual(value(recordExit(started(), CLEAN_EXIT, T3)), value(recordExit(started(), CLEAN_EXIT, T3)));
});
