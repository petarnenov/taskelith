import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { AssignmentExecutions } from '@taskelith/execution';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import {
  ASSIGNMENT_STATES,
  ASSIGNMENT_TRANSITIONS,
  acceptAssignment,
  createAssignment,
  endAssignment,
  isReservationHeldFor,
  launchAssignment,
  launchReservation,
  parseResourceRequest,
  reconcileByOperator,
  refuseAssignment,
  releaseAfterTerminalFact,
  supersedeAssignment,
  type Assignment,
} from '@taskelith/scheduling';
import { value } from '@taskelith/testing';

function code<T>(result: Result<T>): string {
  assert.ok(!result.ok, 'expected a failure');
  return result.error.code;
}

function instant(text: string): Instant {
  return value(parseInstant(text));
}

const T0 = instant('2026-10-25T09:00:00.000Z');
const T1 = instant('2026-10-25T10:00:00.000Z');
const T2 = instant('2026-10-25T11:00:00.000Z');

const WORKER = value(parseIdentifier('WorkerId', 'worker-1'));
const OTHER_WORKER = value(parseIdentifier('WorkerId', 'worker-2'));
const ATTEMPT = value(parseIdentifier('AttemptId', 'attempt-1'));
const TASK = value(parseIdentifier('TaskId', 'task-1'));

const NONE: AssignmentExecutions = { granted: false, nonTerminal: false };
const RUNNING: AssignmentExecutions = { granted: true, nonTerminal: true };
const ENDED: AssignmentExecutions = { granted: true, nonTerminal: false };

function offered(): Assignment {
  return createAssignment({
    id: value(parseIdentifier('AssignmentId', 'assignment-1')),
    attemptId: ATTEMPT,
    workerId: WORKER,
    ownershipGeneration: value(parseOwnershipGeneration(3)),
    reservation: {
      id: value(parseIdentifier('ReservationId', 'reservation-1')),
      scope: {
        projectId: value(parseIdentifier('ProjectId', 'project-1')),
        runId: value(parseIdentifier('RunId', 'run-1')),
        taskId: TASK,
        rootTaskId: TASK,
      },
      requested: value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: ['memory-limit'] })),
      providerCredentials: [],
    },
  }, T0);
}

function accepted(): Assignment {
  const assignment = offered();
  return value(acceptAssignment(assignment, assignment.generation, WORKER, T1));
}

test('an assignment is created offered with its held reservation', () => {
  const assignment = offered();
  assert.equal(assignment.state, 'offered');
  assert.equal(assignment.reservation.state, 'held');
  assert.equal(assignment.reservation.createdAt, T0);
  assert.deepEqual(assignment.reservation.providerCredentials, []);
  assert.ok(Object.isFrozen(assignment.reservation));
  assert.deepEqual(launchAssignment(assignment), {
    assignmentId: 'assignment-1', attemptId: 'attempt-1', workerId: 'worker-1', ownershipGeneration: 3, active: true,
  });
  assert.deepEqual(launchReservation(assignment), { state: 'held', attemptId: 'attempt-1', workerId: 'worker-1' });
});

test('the transition table allows exactly offered to accepted or ended, and accepted to ended', () => {
  assert.deepEqual(Object.keys(ASSIGNMENT_TRANSITIONS), [...ASSIGNMENT_STATES]);
  const ended = value(endAssignment(accepted(), accepted().generation, 'cancelled', NONE, T2));
  assert.equal(code(acceptAssignment(ended, ended.generation, WORKER, T2)), 'precondition-failed');
  assert.equal(code(endAssignment(ended, ended.generation, 'cancelled', NONE, T2)), 'precondition-failed');
  assert.equal(code(acceptAssignment(accepted(), accepted().generation, WORKER, T2)), 'precondition-failed');
});

test('every change takes the generation its writer read', () => {
  const assignment = offered();
  const stale = value(parseGeneration(5));
  assert.equal(code(acceptAssignment(assignment, stale, WORKER, T1)), 'conflict');
  assert.equal(code(releaseAfterTerminalFact(assignment, stale, NONE, T1)), 'conflict');
  assert.equal(code(reconcileByOperator(assignment, stale, T1)), 'conflict');
});

test('only the assigned worker accepts or refuses it', () => {
  const assignment = offered();
  assert.equal(code(acceptAssignment(assignment, assignment.generation, OTHER_WORKER, T1)), 'forbidden');
  const refusal = { workerId: OTHER_WORKER, reason: 'worker-slots-exhausted' as const };
  assert.equal(code(refuseAssignment(assignment, assignment.generation, refusal, NONE, T1)), 'forbidden');
});

test('a refusal ends the assignment and releases its reservation', () => {
  const assignment = offered();
  const refused = value(refuseAssignment(assignment, assignment.generation, { workerId: WORKER, reason: 'worker-admission-pressure' }, NONE, T1));
  assert.deepEqual(refused.end, { reason: 'refused', refusal: 'worker-admission-pressure', endedAt: T1 });
  assert.equal(refused.reservation.state === 'released' && refused.reservation.releasedBy, 'refused');
  assert.equal(launchAssignment(refused).active, false);
});

test('an offer in a protocol version the worker lacks is refused and released', () => {
  const assignment = offered();
  const refused = value(refuseAssignment(assignment, assignment.generation, { workerId: WORKER, reason: 'protocol-not-supported' }, NONE, T1));
  assert.deepEqual(refused.end, { reason: 'refused', refusal: 'protocol-not-supported', endedAt: T1 });
  assert.equal(refused.reservation.state === 'released' && refused.reservation.releasedBy, 'refused');
});

test('ending while an execution can run keeps the reservation until its terminal fact', () => {
  const assignment = accepted();
  const cancelled = value(endAssignment(assignment, assignment.generation, 'cancelled', RUNNING, T1));
  assert.equal(cancelled.state, 'ended');
  assert.equal(cancelled.reservation.state, 'held');
  assert.equal(isReservationHeldFor(cancelled, ATTEMPT, WORKER), true);
  assert.equal(code(releaseAfterTerminalFact(cancelled, cancelled.generation, RUNNING, T2)), 'precondition-failed');
  const released = value(releaseAfterTerminalFact(cancelled, cancelled.generation, ENDED, T2));
  assert.equal(released.reservation.state === 'released' && released.reservation.releasedBy, 'execution-terminal');
  assert.equal(released.reservation.state === 'released' && released.reservation.releasedAt, T2);
  assert.equal(isReservationHeldFor(released, ATTEMPT, WORKER), false);
  assert.equal(code(releaseAfterTerminalFact(released, released.generation, ENDED, T2)), 'precondition-failed');
});

test('a release needs an ended assignment', () => {
  const assignment = accepted();
  assert.equal(code(releaseAfterTerminalFact(assignment, assignment.generation, ENDED, T2)), 'precondition-failed');
});

test('ending with no execution that can run releases at once, justified by the end', () => {
  const assignment = accepted();
  const ended = value(endAssignment(assignment, assignment.generation, 'attempt-ended', ENDED, T1));
  assert.equal(ended.reservation.state === 'released' && ended.reservation.releasedBy, 'attempt-ended');
});

test('only an assignment that never received a grant is superseded', () => {
  const assignment = accepted();
  assert.equal(code(supersedeAssignment(assignment, assignment.generation, ENDED, T1)), 'precondition-failed');
  const superseded = value(supersedeAssignment(assignment, assignment.generation, NONE, T1));
  assert.equal(superseded.end?.reason, 'superseded');
  assert.equal(superseded.reservation.state === 'released' && superseded.reservation.releasedBy, 'superseded');
});

test('an operator reconciliation ends and releases, keeping an earlier end', () => {
  const assignment = accepted();
  const reconciled = value(reconcileByOperator(assignment, assignment.generation, T1));
  assert.deepEqual(reconciled.end, { reason: 'operator-reconciled', endedAt: T1 });
  assert.equal(reconciled.reservation.state === 'released' && reconciled.reservation.releasedBy, 'operator-reconciled');
  assert.equal(code(reconcileByOperator(reconciled, reconciled.generation, T2)), 'precondition-failed');
  const cancelled = value(endAssignment(assignment, assignment.generation, 'cancelled', RUNNING, T1));
  const afterCancel = value(reconcileByOperator(cancelled, cancelled.generation, T2));
  assert.equal(afterCancel.end?.reason, 'cancelled');
});

test('the reservation is held for its own attempt and worker only', () => {
  const assignment = offered();
  assert.equal(isReservationHeldFor(assignment, ATTEMPT, WORKER), true);
  assert.equal(isReservationHeldFor(assignment, ATTEMPT, OTHER_WORKER), false);
  assert.equal(isReservationHeldFor(assignment, value(parseIdentifier('AttemptId', 'attempt-2')), WORKER), false);
});

test('resource requests are positive and name each known hard control once', () => {
  assert.equal(code(parseResourceRequest({ cpuMillicores: 0, memoryMebibytes: 1, hardControls: [] })), 'invalid');
  assert.equal(code(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 1, hardControls: ['gpu-limit'] })), 'invalid');
  assert.equal(code(parseResourceRequest({ cpuMillicores: 1, memoryMebibytes: 1, hardControls: ['cpu-limit', 'cpu-limit'] })), 'invalid');
});

test('an accepted assignment waits out admission pressure instead of being refused', () => {
  const assignment = accepted();
  const pressure = { workerId: WORKER, reason: 'worker-admission-pressure' as const };
  assert.equal(code(refuseAssignment(assignment, assignment.generation, pressure, NONE, T2)), 'precondition-failed');
  const control = { workerId: WORKER, reason: 'control-not-enforceable' as const };
  assert.equal(value(refuseAssignment(assignment, assignment.generation, control, NONE, T2)).state, 'ended');
});

test('a reservation keeps its scope and request when the inputs change later', () => {
  const requested = { cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: ['memory-limit'] as ('memory-limit' | 'cpu-limit')[] };
  const scope = { projectId: value(parseIdentifier('ProjectId', 'project-1')), runId: value(parseIdentifier('RunId', 'run-1')), taskId: TASK, rootTaskId: TASK };
  const assignment = createAssignment({
    id: value(parseIdentifier('AssignmentId', 'assignment-1')),
    attemptId: ATTEMPT,
    workerId: WORKER,
    ownershipGeneration: value(parseOwnershipGeneration(3)),
    reservation: { id: value(parseIdentifier('ReservationId', 'reservation-1')), scope, requested, providerCredentials: [] },
  }, T0);
  scope.projectId = value(parseIdentifier('ProjectId', 'project-2'));
  requested.cpuMillicores = 4000;
  requested.hardControls.push('cpu-limit');
  assert.equal(assignment.reservation.scope.projectId, 'project-1');
  assert.equal(assignment.reservation.requested.cpuMillicores, 1000);
  assert.deepEqual(assignment.reservation.requested.hardControls, ['memory-limit']);
});
