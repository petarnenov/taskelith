import { executionsUnderAssignment, isLaunchAffected, type WorkerId } from '@taskelith/execution';
import { ok, parseIdentifier, type CorrelationId, type Result } from '@taskelith/kernel';
import { invalidateWorkerLaunches, supersedeUngrantedInTransaction, type Assignment } from '@taskelith/scheduling';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// In a worker revocation's transaction: its grants are revoked and its
// executions uncertain, then each attempt that can run nothing is freed.
export async function releaseRevokedWorker(tx: ControlPlaneTransaction, workerId: WorkerId, correlationId: CorrelationId): Promise<Result<void>> {
  const invalidated = await invalidateWorkerLaunches(tx, workerId, correlationId);
  if (!invalidated.ok) return invalidated;
  for (const assignment of await tx.assignments.listUnfinishedByWorker(workerId)) {
    const released = await supersedeIdle(tx, assignment, correlationId);
    if (!released.ok) return released;
  }
  return ok(undefined);
}

// Item 21d D4, "uncertain, never dead": an attempt with an execution that
// could run keeps its ownership and reservation until it is settled.
async function supersedeIdle(tx: ControlPlaneTransaction, assignment: Assignment, correlationId: CorrelationId): Promise<Result<void>> {
  const task = await tx.tasks.get(assignment.reservation.scope.taskId);
  if (!task.ok) return task;
  // Capacity reservation section 6: an assignment with a grant is never
  // superseded, even when its executions are terminal.
  if (isLaunchAffected(task.value, assignment.attemptId) || executionsUnderAssignment(task.value, assignment.id).granted) return ok(undefined);
  // Derived from the assignment, so a rerun sends the same command.
  const commandId = parseIdentifier('EventId', `${assignment.id}.revocation`);
  if (!commandId.ok) return commandId;
  const superseded = await supersedeUngrantedInTransaction(tx, { assignmentId: assignment.id, commandId: commandId.value, correlationId });
  return superseded.ok ? ok(undefined) : superseded;
}
