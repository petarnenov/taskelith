import { createHash } from 'node:crypto';
import type { AssignmentId, WorkerId } from '@taskelith/execution';
import { ok, type CorrelationId, type EventId, type Result } from '@taskelith/kernel';
import { invalidateWorkerLaunches, type ReleaseRequest } from '@taskelith/scheduling';
import { freeIdleAssignment } from './assignment-freeing.js';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// In a worker revocation's transaction: its grants are revoked and its
// executions uncertain, then each attempt that can run nothing is freed.
export async function releaseRevokedWorker(tx: ControlPlaneTransaction, workerId: WorkerId, correlationId: CorrelationId): Promise<Result<void>> {
  const invalidated = await invalidateWorkerLaunches(tx, workerId, correlationId);
  if (!invalidated.ok) return invalidated;
  for (const assignment of await tx.assignments.listUnfinishedByWorker(workerId)) {
    const freed = await freeIdleAssignment(tx, assignment, revocationRequest(assignment.id, correlationId));
    if (!freed.ok) return freed;
  }
  return ok(undefined);
}

// Hashed, so a rerun sends the same command and an assignment identifier
// of any valid length still yields a valid command identifier.
function revocationRequest(assignmentId: AssignmentId, correlationId: CorrelationId): ReleaseRequest {
  const commandId = `v${createHash('sha256').update(JSON.stringify([assignmentId, 'revocation'])).digest('hex')}` as EventId;
  return { assignmentId, commandId, correlationId };
}
