import type { Result } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';

// The broker consumer each worker reads its commands through; the worker's
// own broker user may read it but not create it (execution wire contracts).
export interface WorkerCommandConsumers {
  // Idempotent: an existing consumer of the worker is kept.
  ensure(workerId: WorkerId): Promise<Result<void>>;
}
