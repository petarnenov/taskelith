import type { Instant, Result } from '@taskelith/kernel';
import type { AuditEvent, SecretHash } from '@taskelith/access';
import type { JournalId, WorkerId } from '@taskelith/execution';
import type { BrokerRevocation, CredentialGeneration, EnrolledWorker, EnrollmentToken, RotationRequest } from '../domain/enrollment.js';

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
  // A new journal incarnation: `conflict` unless `previous` is still enrolled
  // and no worker holds `journalId`; `forbidden` if revoked.
  replaceJournal(workerId: WorkerId, previous: JournalId, journalId: JournalId): Promise<Result<void>>;
  // Every enrolled worker that is not revoked, in identifier order.
  activeWorkerIds(): Promise<Result<readonly WorkerId[]>>;
  // At most `limit` revoked workers, the latest revocation first.
  recentlyRevokedWorkerIds(limit: number): Promise<Result<readonly WorkerId[]>>;
  // The worker, revoked or not, with this control-plane hash in its current
  // or predecessor generation; `internal` if two workers hold it.
  workerByCredentialHash(hash: SecretHash): Promise<Result<EnrolledWorker | undefined>>;
  // Records a rotation to the next generation with its audit event, unless
  // one is open; answers the open one. `forbidden` if revoked.
  requestRotation(workerId: WorkerId, request: RotationOrder): Promise<Result<RotationRequest>>;
  // Makes `next` current under the open rotation and audits it once; a
  // repeat answers the stored request. `conflict` with the domain's reason.
  renew(workerId: WorkerId, next: CredentialGeneration, brokerUserJwt: string, at: Instant): Promise<Result<RotationRequest>>;
  // Drops the predecessor of the renewed `generation`, records its broker
  // user, and audits it; answers whether it dropped one.
  confirm(workerId: WorkerId, generation: number, at: Instant): Promise<Result<boolean>>;
  // Marks the worker revoked and records all its broker users for
  // revocation; revoking twice keeps the first time. `not-found` if unknown.
  revoke(workerId: WorkerId, at: Instant): Promise<Result<void>>;
  // Drops every predecessor whose deadline passed by `now`, with its
  // rotation, records its broker user, and audits it; answers how many.
  expirePredecessors(now: Instant): Promise<Result<number>>;
  // The workers whose rotation passed its deadline unrenewed, by `now`.
  unrenewedRotations(now: Instant): Promise<Result<readonly WorkerId[]>>;
  // Revokes the worker as `revoke` does, with an audit event, if its
  // rotation is still unrenewed past its deadline; answers whether it did.
  expireRotation(workerId: WorkerId, now: Instant): Promise<Result<boolean>>;
  // The audit events whose subject is the worker, oldest first.
  credentialAuditTrail(workerId: WorkerId): Promise<Result<readonly AuditEvent[]>>;
  // When a recorded revocation is unpublished, hands every recorded one to
  // `push`, then marks them published; one publisher runs at a time.
  publishRevocations(push: (revocations: readonly BrokerRevocation[]) => Promise<Result<void>>): Promise<Result<number>>;
}

// What `rotate-worker` asks for: the request time, its deadline, and the
// operator's actor and reason for the audit event.
export interface RotationOrder {
  readonly requestedAt: Instant;
  readonly deadline: Instant;
  readonly actor: string;
  readonly reason: string;
}
