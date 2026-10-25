import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// Capacity reservation section 13: a child's terminal outcome closes its
// delegation; a task that was not delegated has none to close.
export async function closeDelegationOf(tx: ControlPlaneTransaction, taskId: TaskId, at: Instant): Promise<Result<void>> {
  const closed = await tx.ledger.closeDelegation(taskId, at);
  return closed.ok || closed.error.code === 'not-found' ? ok(undefined) : closed;
}
