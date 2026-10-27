import { validGenerations, type WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneTransaction } from './control-plane-store.js';

// The bearer was checked before the transaction; a revocation or an ended
// grace window since then refuses the write (trust model, section 4).
export async function checkCredential(tx: ControlPlaneTransaction, principal: WorkerPrincipal): Promise<Result<void>> {
  const worker = await tx.fleet.worker(principal.workerId);
  if (!worker.ok) return worker;
  const valid = worker.value !== undefined && worker.value.revokedAt === undefined
    && validGenerations(worker.value.credentials, await tx.now()).some((generation) => generation.generation === principal.generation);
  if (valid) return ok(undefined);
  return err(failure('forbidden', 'the worker credential is not valid', { reason: 'worker-not-authorized' }));
}
