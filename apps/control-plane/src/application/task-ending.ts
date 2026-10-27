import { openAttempt, type AttemptId, type Task } from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import { automaticRetryOf } from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';
import { nextAttemptIdOf } from './attempt-identities.js';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// In the transaction that ended the attempt: an automatic retry opens under
// the next derived attempt identity, or the terminal task's delegation closes.
export async function followAttemptEnd(tx: ControlPlaneTransaction, task: Task, attemptId: AttemptId, at: Instant): Promise<Result<void>> {
  if (!automaticRetryOf(task, attemptId)) return closeDelegationOf(tx, task.id, at);
  const retry = openAttempt(task, task.ownershipGeneration, { id: nextAttemptIdOf(task), retryOf: attemptId }, at);
  return retry.ok ? tx.tasks.replace(retry.value, task.generation) : retry;
}

// Capacity reservation section 13: a child's terminal outcome closes its
// delegation; a task that was not delegated has none to close.
export async function closeDelegationOf(tx: ControlPlaneTransaction, taskId: TaskId, at: Instant): Promise<Result<void>> {
  const closed = await tx.ledger.closeDelegation(taskId, at);
  return closed.ok || closed.error.code === 'not-found' ? ok(undefined) : closed;
}
