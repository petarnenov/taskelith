import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type {
  AssignmentExecutions,
  AssignmentId,
  AttemptId,
  LaunchAssignment,
  LaunchReservation,
  WorkerId,
} from '@taskelith/execution';
import { FIRST_GENERATION, checkGeneration, nextGeneration, type Generation, type OwnershipGeneration } from '@taskelith/sdlc';
import {
  heldReservation,
  releasedReservation,
  type CapacityReservation,
  type ReleaseJustification,
  type ReservationValues,
} from './capacity-reservation.js';

// Acceptance is the worker's journaled acknowledgement; it is not permission
// to launch (invariant 13) and not a start (invariant 3).
export const ASSIGNMENT_STATES = Object.freeze(['offered', 'accepted', 'ended'] as const);

export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

export const ASSIGNMENT_TRANSITIONS: Readonly<Record<AssignmentState, readonly AssignmentState[]>> = Object.freeze({
  offered: Object.freeze(['accepted', 'ended'] as const),
  accepted: Object.freeze(['ended'] as const),
  ended: Object.freeze([] as const),
});

export const ASSIGNMENT_END_REASONS = Object.freeze([
  'refused',
  'superseded',
  'cancelled',
  'attempt-ended',
  'operator-reconciled',
] as const satisfies readonly ReleaseJustification[]);

export type AssignmentEndReason = (typeof ASSIGNMENT_END_REASONS)[number];

// The worker-side reasons of the capacity reservation contract, section 11.
export const REFUSAL_REASONS = Object.freeze([
  'worker-slots-exhausted',
  'worker-capacity-exhausted',
  'resource-ceiling-exceeded',
  'control-not-enforceable',
  'worker-admission-pressure',
] as const);

export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export interface AssignmentEnd {
  readonly reason: AssignmentEndReason;
  readonly refusal?: RefusalReason;
  readonly endedAt: Instant;
}

// The scheduler's placement of one attempt on one worker at the ownership
// generation it was created at, with the reservation it holds.
export interface Assignment {
  readonly id: AssignmentId;
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly state: AssignmentState;
  readonly end?: AssignmentEnd;
  readonly reservation: CapacityReservation;
  readonly generation: Generation;
  readonly changedAt: Instant;
}

export interface AssignmentInput {
  readonly id: AssignmentId;
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly reservation: Omit<ReservationValues, 'createdAt'>;
}

export interface Refusal {
  readonly workerId: WorkerId;
  readonly reason: RefusalReason;
}

// Created with its held reservation in one transaction (contract section 4).
export function createAssignment(input: AssignmentInput, at: Instant): Assignment {
  return Object.freeze({
    id: input.id,
    attemptId: input.attemptId,
    workerId: input.workerId,
    ownershipGeneration: input.ownershipGeneration,
    state: 'offered',
    reservation: heldReservation({ ...input.reservation, createdAt: at }),
    generation: FIRST_GENERATION,
    changedAt: at,
  });
}

export function acceptAssignment(assignment: Assignment, expectedGeneration: Generation, workerId: WorkerId, at: Instant): Result<Assignment> {
  const allowed = checkTransition(assignment, expectedGeneration, 'accepted');
  if (!allowed.ok) return allowed;
  const worker = checkWorker(assignment, workerId);
  if (!worker.ok) return worker;
  return ok(changedAssignment(assignment, { state: 'accepted' }, at));
}

// A refusal ends the assignment and releases unless an execution under it can
// run; an accepted one waits out admission pressure (contract section 8).
export function refuseAssignment(
  assignment: Assignment,
  expectedGeneration: Generation,
  refusal: Refusal,
  executions: AssignmentExecutions,
  at: Instant,
): Result<Assignment> {
  const worker = checkWorker(assignment, refusal.workerId);
  if (!worker.ok) return worker;
  if (refusal.reason === 'worker-admission-pressure' && assignment.state === 'accepted') {
    return assignmentFailure(assignment, 'is accepted and waits while its worker is under admission pressure');
  }
  return endWith(assignment, expectedGeneration, { reason: 'refused', refusal: refusal.reason, endedAt: at }, executions);
}

// Ends a cancelled assignment or one whose attempt ended; while an execution
// under it can run, the end is its cancellation and capacity stays held.
export function endAssignment(
  assignment: Assignment,
  expectedGeneration: Generation,
  reason: 'cancelled' | 'attempt-ended',
  executions: AssignmentExecutions,
  at: Instant,
): Result<Assignment> {
  return endWith(assignment, expectedGeneration, { reason, endedAt: at }, executions);
}

// Bounded supersession: only an assignment that never received a grant is
// superseded, and its reservation is released with it.
export function supersedeAssignment(
  assignment: Assignment,
  expectedGeneration: Generation,
  executions: AssignmentExecutions,
  at: Instant,
): Result<Assignment> {
  if (executions.granted) return assignmentFailure(assignment, 'received a launch authorization and is not superseded');
  return endWith(assignment, expectedGeneration, { reason: 'superseded', endedAt: at }, executions);
}

// Releases the reservation of an ended assignment once no execution under
// it can run, in the transaction that records that terminal fact.
export function releaseAfterTerminalFact(
  assignment: Assignment,
  expectedGeneration: Generation,
  executions: AssignmentExecutions,
  at: Instant,
): Result<Assignment> {
  const generation = checkGeneration(`assignment ${assignment.id}`, assignment.generation, expectedGeneration);
  if (!generation.ok) return generation;
  if (assignment.state !== 'ended') return assignmentFailure(assignment, 'has not ended');
  if (assignment.reservation.state === 'released') return assignmentFailure(assignment, 'has already released its reservation');
  if (executions.nonTerminal) return assignmentFailure(assignment, 'still has an execution that can run');
  const reservation = releasedReservation(assignment.reservation, 'execution-terminal', at);
  return ok(changedAssignment(assignment, { state: 'ended', reservation }, at));
}

// An operator's audited reconciliation ends the assignment and releases its
// reservation; the execution side records the outcome in the same change.
export function reconcileByOperator(assignment: Assignment, expectedGeneration: Generation, at: Instant): Result<Assignment> {
  const generation = checkGeneration(`assignment ${assignment.id}`, assignment.generation, expectedGeneration);
  if (!generation.ok) return generation;
  if (assignment.reservation.state === 'released') return assignmentFailure(assignment, 'has already released its reservation');
  const end = assignment.end ?? Object.freeze({ reason: 'operator-reconciled' as const, endedAt: at });
  const reservation = releasedReservation(assignment.reservation, 'operator-reconciled', at);
  return ok(changedAssignment(assignment, { state: 'ended', end, reservation }, at));
}

// "Held for this attempt on this worker", as the launch authority compares it.
export function isReservationHeldFor(assignment: Assignment, attemptId: AttemptId, workerId: WorkerId): boolean {
  return assignment.reservation.state === 'held' && assignment.attemptId === attemptId && assignment.workerId === workerId;
}

export function launchAssignment(assignment: Assignment): LaunchAssignment {
  const { id: assignmentId, attemptId, workerId, ownershipGeneration } = assignment;
  return Object.freeze({ assignmentId, attemptId, workerId, ownershipGeneration, active: assignment.state !== 'ended' });
}

export function launchReservation(assignment: Assignment): LaunchReservation {
  const { attemptId, workerId } = assignment;
  return Object.freeze({ state: assignment.reservation.state, attemptId, workerId });
}

function endWith(
  assignment: Assignment,
  expectedGeneration: Generation,
  end: AssignmentEnd,
  executions: AssignmentExecutions,
): Result<Assignment> {
  const allowed = checkTransition(assignment, expectedGeneration, 'ended');
  if (!allowed.ok) return allowed;
  const reservation = executions.nonTerminal
    ? assignment.reservation
    : releasedReservation(assignment.reservation, end.reason, end.endedAt);
  return ok(changedAssignment(assignment, { state: 'ended', end: Object.freeze(end), reservation }, end.endedAt));
}

function checkTransition(assignment: Assignment, expectedGeneration: Generation, to: AssignmentState): Result<void> {
  const generation = checkGeneration(`assignment ${assignment.id}`, assignment.generation, expectedGeneration);
  if (!generation.ok) return generation;
  if (!ASSIGNMENT_TRANSITIONS[assignment.state].includes(to)) {
    return assignmentFailure(assignment, `cannot change from ${assignment.state} to ${to}`, { from: assignment.state, to });
  }
  return ok(undefined);
}

function checkWorker(assignment: Assignment, workerId: WorkerId): Result<void> {
  if (assignment.workerId === workerId) return ok(undefined);
  return err(failure('forbidden', `assignment ${assignment.id} is held by another worker`, { assignment: assignment.id, worker: workerId }));
}

function assignmentFailure(assignment: Assignment, message: string, details: Readonly<Record<string, string>> = {}): Result<never> {
  return err(failure('precondition-failed', `assignment ${assignment.id} ${message}`, { assignment: assignment.id, ...details }));
}

type AssignmentChange = Pick<Assignment, 'state'> & Partial<Pick<Assignment, 'end' | 'reservation'>>;

function changedAssignment(assignment: Assignment, change: AssignmentChange, at: Instant): Assignment {
  return Object.freeze({ ...assignment, ...change, generation: nextGeneration(assignment.generation), changedAt: at });
}
