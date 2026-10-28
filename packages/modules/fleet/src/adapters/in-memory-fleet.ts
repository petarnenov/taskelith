import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AuditEvent, SecretHash } from '@taskelith/access';
import type { JournalId, WorkerId } from '@taskelith/execution';
import type { Clock } from '@taskelith/sdlc';
import {
  confirmationStep,
  predecessorExpiryStep,
  renewalStep,
  requestStep,
  rotationExpiryStep,
  type RotationStep,
} from '../domain/credential-rotation.js';
import {
  credentialGenerations,
  isExpired,
  revocationOf,
  unrenewedPastDeadline,
  type BrokerRevocation,
  type CredentialGeneration,
  type EnrolledWorker,
  type EnrollmentToken,
  type RotationRequest,
} from '../domain/enrollment.js';
import type { InstallationIdentity } from '../domain/installation.js';
import type { FleetRegistry, RotationOrder } from '../ports/fleet-registry.js';
import type { InstallationRecord, InstallationTable } from '../ports/installation-records.js';

// Each method checks and writes without awaiting, so that concurrent writers
// cannot both pass a check, as a SERIALIZABLE store guarantees.
export class InMemoryFleetRegistry implements FleetRegistry {
  readonly #tokens = new Map<SecretHash, { token: EnrollmentToken; used: boolean }>();
  readonly #workers = new Map<WorkerId, EnrolledWorker>();
  readonly #revocations = new Map<string, { revocation: BrokerRevocation; published: boolean }>();
  readonly #audit: AuditEvent[] = [];
  readonly #now: () => Instant;
  #publishing: Promise<unknown> = Promise.resolve();

  // `now` is the moment a token is used, as a database's clock would be.
  constructor(now: () => Instant) {
    this.#now = now;
  }

  addToken(token: EnrollmentToken): Promise<Result<void>> {
    if (this.#tokens.has(token.hash)) return settle(err(failure('conflict', 'the enrollment token exists')));
    this.#tokens.set(token.hash, { token: Object.freeze({ ...token }), used: false });
    return settle(ok(undefined));
  }

  unusedToken(hash: SecretHash): Promise<Result<EnrollmentToken | undefined>> {
    const stored = this.#tokens.get(hash);
    return settle(ok(stored === undefined || stored.used ? undefined : stored.token));
  }

  enroll(tokenHash: SecretHash, worker: EnrolledWorker): Promise<Result<void>> {
    const stored = this.#tokens.get(tokenHash);
    if (stored === undefined || stored.used) return settle(err(failure('conflict', 'the token was used', { reason: 'token-used' })));
    if (isExpired(stored.token, this.#now())) return settle(err(failure('conflict', 'the token expired', { reason: 'token-expired' })));
    if ([...this.#workers.values()].some((known) => known.journalId === worker.journalId)) {
      return settle(err(failure('conflict', 'the journal is enrolled', { reason: 'journal-enrolled' })));
    }
    if (this.#workers.has(worker.workerId)) return settle(err(failure('conflict', 'the worker exists')));
    stored.used = true;
    this.#workers.set(worker.workerId, Object.freeze({ ...worker }));
    return settle(ok(undefined));
  }

  worker(workerId: WorkerId): Promise<Result<EnrolledWorker | undefined>> {
    return settle(ok(this.#workers.get(workerId)));
  }

  replaceJournal(workerId: WorkerId, previous: JournalId, journalId: JournalId): Promise<Result<void>> {
    const worker = this.#workers.get(workerId);
    if (worker === undefined) return settle(err(failure('not-found', `no worker ${workerId} is enrolled`)));
    if (worker.revokedAt !== undefined) return settle(err(failure('forbidden', `worker ${workerId} is revoked`)));
    if (worker.journalId !== previous) return settle(err(failure('conflict', `worker ${workerId} no longer holds journal ${previous}`)));
    if ([...this.#workers.values()].some((known) => known.journalId === journalId)) {
      return settle(err(failure('conflict', 'the journal is enrolled', { reason: 'journal-enrolled' })));
    }
    this.#workers.set(workerId, Object.freeze({ ...worker, journalId }));
    return settle(ok(undefined));
  }

  activeWorkerIds(): Promise<Result<readonly WorkerId[]>> {
    const active = [...this.#workers.values()].filter((worker) => worker.revokedAt === undefined).map((worker) => worker.workerId);
    return settle(ok(Object.freeze(active.sort())));
  }

  recentlyRevokedWorkerIds(limit: number): Promise<Result<readonly WorkerId[]>> {
    const revoked = [...this.#workers.values()].filter((worker) => worker.revokedAt !== undefined);
    const latestFirst = revoked.sort((a, b) => b.revokedAt!.localeCompare(a.revokedAt!) || a.workerId.localeCompare(b.workerId));
    return settle(ok(Object.freeze(latestFirst.slice(0, limit).map((worker) => worker.workerId))));
  }

  workerByCredentialHash(hash: SecretHash): Promise<Result<EnrolledWorker | undefined>> {
    const holds = (worker: EnrolledWorker) => credentialGenerations(worker.credentials).some((generation) => generation.controlPlaneHash === hash);
    const holders = [...this.#workers.values()].filter(holds);
    if (holders.length > 1) return settle(err(failure('internal', 'a control-plane hash belongs to two workers')));
    return settle(ok(holders[0]));
  }

  requestRotation(workerId: WorkerId, order: RotationOrder): Promise<Result<RotationRequest>> {
    const worker = this.#activeWorker(workerId);
    if (!worker.ok) return settle(worker);
    const step = requestStep(worker.value, order);
    this.#apply(step);
    return settle(ok(step.request));
  }

  renew(workerId: WorkerId, next: CredentialGeneration, brokerUserJwt: string, clock: Clock): Promise<Result<RotationRequest>> {
    const worker = this.#activeWorker(workerId);
    if (!worker.ok) return settle(worker);
    const step = renewalStep(worker.value, next, brokerUserJwt, clock.now());
    if (!step.ok) return settle(step);
    this.#apply(step.value);
    return settle(ok(step.value.request));
  }

  confirm(workerId: WorkerId, generation: number, clock: Clock): Promise<Result<boolean>> {
    const worker = this.#activeWorker(workerId);
    if (!worker.ok) return settle(worker);
    const step = confirmationStep(worker.value, generation, clock.now());
    if (!step.ok) return settle(step);
    this.#apply(step.value);
    return settle(ok(step.value.dropped));
  }

  revoke(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    const worker = this.#workers.get(workerId);
    if (worker === undefined) return settle(err(failure('not-found', `no worker ${workerId} is enrolled`)));
    if (worker.revokedAt !== undefined) return settle(ok(undefined));
    this.#record(credentialGenerations(worker.credentials).map((generation) => revocationOf(generation, at)));
    this.#workers.set(workerId, Object.freeze({ ...worker, revokedAt: at }));
    return settle(ok(undefined));
  }

  expirePredecessors(now: Instant): Promise<Result<number>> {
    let expired = 0;
    for (const worker of this.#workers.values()) {
      const step = predecessorExpiryStep(worker, now);
      if (step === undefined) continue;
      this.#apply(step);
      expired += 1;
    }
    return settle(ok(expired));
  }

  unrenewedRotations(now: Instant): Promise<Result<readonly WorkerId[]>> {
    const due = [...this.#workers.values()].filter((worker) => worker.revokedAt === undefined && unrenewedPastDeadline(worker.credentials, now));
    return settle(ok(Object.freeze(due.map((worker) => worker.workerId).sort())));
  }

  expireRotation(workerId: WorkerId, now: Instant): Promise<Result<boolean>> {
    const worker = this.#workers.get(workerId);
    if (worker === undefined) return settle(err(failure('not-found', `no worker ${workerId} is enrolled`)));
    const step = rotationExpiryStep(worker, now);
    if (step === undefined) return settle(ok(false));
    this.#apply(step);
    return settle(ok(true));
  }

  credentialAuditTrail(workerId: WorkerId): Promise<Result<readonly AuditEvent[]>> {
    return settle(ok(Object.freeze(this.#audit.filter((event) => event.subject === workerId))));
  }

  publishRevocations(push: (revocations: readonly BrokerRevocation[]) => Promise<Result<void>>): Promise<Result<number>> {
    const run = this.#publishing.then(() => this.#publish(push));
    this.#publishing = run.catch(() => undefined);
    return run;
  }

  async #publish(push: (revocations: readonly BrokerRevocation[]) => Promise<Result<void>>): Promise<Result<number>> {
    const unpublished = [...this.#revocations.values()].filter((entry) => !entry.published);
    if (unpublished.length === 0) return ok(0);
    const pushed = await push([...this.#revocations.values()].map((entry) => entry.revocation));
    if (!pushed.ok) return pushed;
    for (const entry of unpublished) entry.published = true;
    return ok(unpublished.length);
  }

  #activeWorker(workerId: WorkerId): Result<EnrolledWorker> {
    const worker = this.#workers.get(workerId);
    if (worker === undefined) return err(failure('not-found', `no worker ${workerId} is enrolled`));
    return worker.revokedAt === undefined ? ok(worker) : err(failure('forbidden', `worker ${workerId} is revoked`));
  }

  #apply(step: RotationStep): void {
    this.#record(step.revocations);
    if (step.event !== undefined) this.#audit.push(step.event);
    this.#workers.set(step.worker.workerId, step.worker);
  }

  #record(revocations: readonly BrokerRevocation[]): void {
    for (const revocation of revocations) {
      if (!this.#revocations.has(revocation.userKey)) this.#revocations.set(revocation.userKey, { revocation, published: false });
    }
  }
}

// Holds one identity, as the record file or the table row does.
export class InMemoryInstallationRecord implements InstallationRecord, InstallationTable {
  #identity: InstallationIdentity | undefined;

  constructor(identity?: InstallationIdentity) {
    this.#identity = identity;
  }

  read(): Promise<Result<InstallationIdentity | undefined>> {
    return settle(ok(this.#identity));
  }

  create(identity: InstallationIdentity): Promise<Result<void>> {
    if (this.#identity !== undefined) return settle(err(failure('conflict', 'the installation record exists')));
    this.#identity = identity;
    return settle(ok(undefined));
  }

  initialize(identity: InstallationIdentity): Promise<Result<void>> {
    return this.create(identity);
  }
}

function settle<T>(result: Result<T>): Promise<Result<T>> {
  return Promise.resolve(result);
}
