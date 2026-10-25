import type { WorkerId } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// Who a message claims to come from, and the worker its subject names.
export interface ProducerClaim {
  readonly subjectWorkerId: string | undefined;
  readonly workerId: WorkerId;
  readonly journalId: string;
}

// Item 21b decision 2: the subject's worker, enrolled and not revoked,
// under its enrolled journal.
export async function isAuthenticProducer(tx: ControlPlaneTransaction, claim: ProducerClaim): Promise<Result<boolean>> {
  const worker = await tx.fleet.worker(claim.workerId);
  if (!worker.ok) return worker;
  const enrolled = worker.value;
  return ok(claim.subjectWorkerId === claim.workerId && enrolled !== undefined
    && enrolled.revokedAt === undefined && enrolled.journalId === claim.journalId);
}
