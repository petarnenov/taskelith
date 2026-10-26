import { createHash } from 'node:crypto';
import { activeAttempt, endAttempt, executionsUnderAssignment, isLaunchAffected, type AssignmentId, type Task, type WorkerId } from '@taskelith/execution';
import { ok, type CorrelationId, type EventId, type Result } from '@taskelith/kernel';
import {
  invalidateWorkerLaunches,
  releaseInTransaction,
  supersedeUngrantedInTransaction,
  type Assignment,
  type ReleaseRequest,
} from '@taskelith/scheduling';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// In a worker revocation's transaction: its grants are revoked and its
// executions uncertain, then each attempt that can run nothing is freed.
export async function releaseRevokedWorker(tx: ControlPlaneTransaction, workerId: WorkerId, correlationId: CorrelationId): Promise<Result<void>> {
  const invalidated = await invalidateWorkerLaunches(tx, workerId, correlationId);
  if (!invalidated.ok) return invalidated;
  for (const assignment of await tx.assignments.listUnfinishedByWorker(workerId)) {
    const released = await releaseIdle(tx, assignment, correlationId);
    if (!released.ok) return released;
  }
  return ok(undefined);
}

// Item 21d D4, "uncertain, never dead": an attempt with an execution that
// could run keeps its ownership and reservation until it is settled.
async function releaseIdle(tx: ControlPlaneTransaction, assignment: Assignment, correlationId: CorrelationId): Promise<Result<void>> {
  const task = await tx.tasks.get(assignment.reservation.scope.taskId);
  if (!task.ok) return task;
  if (isLaunchAffected(task.value, assignment.attemptId)) return ok(undefined);
  // Capacity reservation section 6: an assignment that held a grant is
  // never superseded, so its attempt ends instead.
  if (executionsUnderAssignment(task.value, assignment.id).granted) return endIdleAttempt(tx, task.value, assignment, correlationId);
  const superseded = await supersedeUngrantedInTransaction(tx, revocationRequest(assignment.id, 'superseded', correlationId));
  return superseded.ok ? ok(undefined) : superseded;
}

// The release of an ended attempt ends its assignment as `attempt-ended`.
async function endIdleAttempt(tx: ControlPlaneTransaction, task: Task, assignment: Assignment, correlationId: CorrelationId): Promise<Result<void>> {
  if (activeAttempt(task)?.id === assignment.attemptId) {
    const ended = endAttempt(task, assignment.attemptId, await tx.now());
    if (!ended.ok) return ended;
    const stored = await tx.tasks.replace(ended.value, task.generation);
    if (!stored.ok) return stored;
  }
  const released = await releaseInTransaction(tx, revocationRequest(assignment.id, 'attempt-ended', correlationId));
  return released.ok ? ok(undefined) : released;
}

// Hashed, so a rerun sends the same command and an assignment identifier
// of any valid length still yields a valid command identifier.
function revocationRequest(assignmentId: AssignmentId, release: string, correlationId: CorrelationId): ReleaseRequest {
  const commandId = `v${createHash('sha256').update(JSON.stringify([assignmentId, release])).digest('hex')}` as EventId;
  return { assignmentId, commandId, correlationId };
}
