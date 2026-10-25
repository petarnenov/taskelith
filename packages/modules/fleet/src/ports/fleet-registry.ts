import type { Instant, Result } from '@taskelith/kernel';
import type { SecretHash } from '@taskelith/access';
import type { WorkerId } from '@taskelith/execution';
import type { BrokerRevocation, CredentialGeneration, EnrolledWorker, EnrollmentToken } from '../domain/enrollment.js';

// Tokens, enrolled workers, and the durable list of broker users to revoke;
// every write is atomic at SERIALIZABLE, since placement reads the workers.
export interface FleetRegistry {
  addToken(token: EnrollmentToken): Promise<Result<void>>;
  // An unused token by its hash; a used one reads as absent.
  unusedToken(hash: SecretHash): Promise<Result<EnrollmentToken | undefined>>;
  // Uses the token if unused and unexpired at that moment, and adds the worker;
  // else `conflict`: `token-used`, `token-expired`, or `journal-enrolled`.
  enroll(tokenHash: SecretHash, worker: EnrolledWorker): Promise<Result<void>>;
  worker(workerId: WorkerId): Promise<Result<EnrolledWorker | undefined>>;
  // The worker, revoked or not, that has this control-plane hash in its
  // current or predecessor generation, for bearer authentication.
  workerByCredentialHash(hash: SecretHash): Promise<Result<EnrolledWorker | undefined>>;
  // `next` becomes current, the current one predecessor until `validUntil`; a
  // dropped one is recorded. `forbidden` if revoked, `conflict` if stale.
  rotate(workerId: WorkerId, expectedGeneration: number, next: CredentialGeneration, validUntil: Instant, at: Instant): Promise<Result<void>>;
  // Marks the worker revoked and records all its broker users for
  // revocation; revoking twice keeps the first time. `not-found` if unknown.
  revoke(workerId: WorkerId, at: Instant): Promise<Result<void>>;
  // Drops every predecessor whose grace window ended by `now` and records
  // its broker user for revocation; answers how many it dropped.
  expirePredecessors(now: Instant): Promise<Result<number>>;
  // When a recorded revocation is unpublished, hands every recorded one to
  // `push`, then marks them published; one publisher runs at a time.
  publishRevocations(push: (revocations: readonly BrokerRevocation[]) => Promise<Result<void>>): Promise<Result<number>>;
}
