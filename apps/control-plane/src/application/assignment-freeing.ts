import { activeAttempt, endAttempt, executionsUnderAssignment, isLaunchAffected, type Task } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import { releaseInTransaction, supersedeUngrantedInTransaction, type Assignment, type ReleaseRequest } from '@taskelith/scheduling';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import { followAttemptEnd } from './task-ending.js';

// Item 21d D4, "uncertain, never dead": an attempt with an execution that
// could run keeps its ownership and reservation until it is settled.
export async function freeIdleAssignment(tx: ControlPlaneTransaction, assignment: Assignment, request: ReleaseRequest): Promise<Result<void>> {
  const task = await tx.tasks.get(assignment.reservation.scope.taskId);
  if (!task.ok) return task;
  if (isLaunchAffected(task.value, assignment.attemptId)) return ok(undefined);
  // Capacity reservation section 6: an assignment that held a grant is
  // never superseded, so its attempt ends instead.
  if (executionsUnderAssignment(task.value, assignment.id).granted) return endIdleAttempt(tx, task.value, assignment, request);
  const superseded = await supersedeUngrantedInTransaction(tx, request);
  return superseded.ok ? ok(undefined) : superseded;
}

// The release of an ended attempt ends its assignment as `attempt-ended`,
// and the end is followed as an observed one is (21b).
async function endIdleAttempt(tx: ControlPlaneTransaction, task: Task, assignment: Assignment, request: ReleaseRequest): Promise<Result<void>> {
  if (activeAttempt(task)?.id !== assignment.attemptId) return release(tx, request);
  const at = await tx.now();
  const ended = endAttempt(task, assignment.attemptId, at);
  if (!ended.ok) return ended;
  const stored = await tx.tasks.replace(ended.value, task.generation);
  if (!stored.ok) return stored;
  const released = await release(tx, request);
  return released.ok ? followAttemptEnd(tx, ended.value, assignment.attemptId, at) : released;
}

async function release(tx: ControlPlaneTransaction, request: ReleaseRequest): Promise<Result<void>> {
  const released = await releaseInTransaction(tx, request);
  return released.ok ? ok(undefined) : released;
}
