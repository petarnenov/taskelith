import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { SecretHash } from '@taskelith/access';
import type { WorkerId } from '@taskelith/execution';
import type { EnrolledWorker, EnrollmentToken, WorkerCredentials } from '../domain/enrollment.js';
import type { InstallationIdentity } from '../domain/installation.js';
import type { FleetRegistry } from '../ports/fleet-registry.js';
import type { InstallationRecord, InstallationTable } from '../ports/installation-records.js';

// Each method checks and writes without awaiting, so that concurrent writers
// cannot both pass a check, as a SERIALIZABLE store guarantees.
export class InMemoryFleetRegistry implements FleetRegistry {
  readonly #tokens = new Map<SecretHash, { token: EnrollmentToken; used: boolean }>();
  readonly #workers = new Map<WorkerId, EnrolledWorker>();

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

  replaceCredentials(workerId: WorkerId, expectedGeneration: number, next: WorkerCredentials): Promise<Result<void>> {
    const worker = this.#workers.get(workerId);
    if (worker === undefined) return settle(err(failure('not-found', `no worker ${workerId}`)));
    if (worker.credentials.current.generation !== expectedGeneration) {
      return settle(err(failure('conflict', `the current generation is ${worker.credentials.current.generation}`)));
    }
    this.#workers.set(workerId, Object.freeze({ ...worker, credentials: next }));
    return settle(ok(undefined));
  }

  revoke(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    const worker = this.#workers.get(workerId);
    if (worker === undefined) return settle(err(failure('not-found', `no worker ${workerId}`)));
    if (worker.revokedAt === undefined) this.#workers.set(workerId, Object.freeze({ ...worker, revokedAt: at }));
    return settle(ok(undefined));
  }

  expiredPredecessors(now: Instant): Promise<Result<readonly EnrolledWorker[]>> {
    const expired = [...this.#workers.values()].filter((worker) =>
      worker.credentials.previous !== undefined && Date.parse(worker.credentials.previous.validUntil) <= Date.parse(now));
    return settle(ok(expired));
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
