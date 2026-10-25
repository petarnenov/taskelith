import type { Instant, Result } from '@taskelith/kernel';
import type { SecretHash } from '@taskelith/access';
import type { WorkerId } from '@taskelith/execution';
import type { EnrolledWorker, EnrollmentToken, WorkerCredentials } from '../domain/enrollment.js';

// Enrollment tokens and enrolled workers. Every write is atomic and runs at
// SERIALIZABLE, since placement reads the same workers.
export interface FleetRegistry {
  addToken(token: EnrollmentToken): Promise<Result<void>>;
  // An unused token by its hash; a used one reads as absent.
  unusedToken(hash: SecretHash): Promise<Result<EnrollmentToken | undefined>>;
  // Uses the token and adds the worker together; `conflict` with the reason
  // `token-used` or `journal-enrolled` when either is taken.
  enroll(tokenHash: SecretHash, worker: EnrolledWorker): Promise<Result<void>>;
  worker(workerId: WorkerId): Promise<Result<EnrolledWorker | undefined>>;
  // `conflict` unless the stored current generation is `expectedGeneration`.
  replaceCredentials(workerId: WorkerId, expectedGeneration: number, next: WorkerCredentials): Promise<Result<void>>;
  // `not-found` for an unknown worker; revoking twice keeps the first time.
  revoke(workerId: WorkerId, at: Instant): Promise<Result<void>>;
  // Workers whose predecessor credentials' grace window ended by `now`.
  expiredPredecessors(now: Instant): Promise<Result<readonly EnrolledWorker[]>>;
}
