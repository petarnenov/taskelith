import type { Instant, Result } from '@taskelith/kernel';
import type { AuditEvent, SecretHash } from '@taskelith/access';
import type { JournalId, WorkerId } from '@taskelith/execution';
import type { Clock } from '@taskelith/sdlc';
import type { RotationOrder } from '../domain/credential-rotation.js';
import type {
  BrokerRevocation,
  CredentialGeneration,
  EnrolledWorker,
  EnrollmentToken,
  EnrollmentTokenRecord,
  RotationRequest,
} from '../domain/enrollment.js';

// Tokens, enrolled workers, and the durable list of broker users to revoke;
// every write is atomic at SERIALIZABLE, since placement reads the workers.
export interface FleetRegistry {
  addToken(token: EnrollmentToken): Promise<Result<void>>;
  // An unused, unrevoked token by its hash; any other reads as absent.
  unusedToken(hash: SecretHash): Promise<Result<EnrollmentToken | undefined>>;
  // Uses a pending, unexpired token and adds the worker; else `conflict`:
  // `token-used`, `token-revoked`, `token-expired`, or `journal-enrolled`.
  enroll(tokenHash: SecretHash, worker: EnrolledWorker): Promise<Result<void>>;
  // At most `limit` unused, unrevoked, unexpired tokens after `after`, in
  // identifier order (control-plane wire contracts section 6).
  pendingTokens(after: string | undefined, limit: number): Promise<Result<readonly EnrollmentTokenRecord[]>>;
  // The token's record, pending or not, without its hash.
  tokenById(tokenId: string): Promise<Result<EnrollmentTokenRecord | undefined>>;
  // Revokes the token at `at` under its row lock, or repeats; `not-found` if
  // unknown, else `precondition-failed` as `revocationRefusal` decides.
  revokeToken(tokenId: string, at: Instant): Promise<Result<void>>;
  // Revokes the token and adds `replacement` as what replaced it, in one
  // write; `not-found`, or `precondition-failed` as `rotationRefusal` decides.
  rotateToken(tokenId: string, replacement: EnrollmentToken, at: Instant): Promise<Result<void>>;
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
  // Makes `next` current once, audited; a repeat answers the stored request.
  // `conflict` per the domain; `forbidden` past the deadline after the lock.
  renew(workerId: WorkerId, next: CredentialGeneration, brokerUserJwt: string, clock: Clock): Promise<Result<RotationRequest>>;
  // Drops the predecessor of the renewed `generation`, confirmed, or past
  // the deadline read from `clock` after the lock, expired; answers whether.
  confirm(workerId: WorkerId, generation: number, clock: Clock): Promise<Result<boolean>>;
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
