import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AuditEvent, OperatorCredential, OperatorCredentials, SecretHash } from '@taskelith/access';
import type { WorkerId } from '@taskelith/execution';
import {
  brokerUserKeys,
  installationIdentity,
  rotateCredentials,
  type BrokerRevocation,
  type CredentialGeneration,
  type EnrolledWorker,
  type EnrollmentToken,
  type FleetRegistry,
  type HostConstraints,
  type InstallationIdentity,
  type InstallationTable,
} from '@taskelith/fleet';
import { instant } from './capacity-repositories.js';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

// Item 13's records. An enrolled worker is a JSON record beside the columns
// placement reads, which enrollment and revocation keep in step.

// One fixed key of PostgreSQL's advisory locks for revocation publishers.
const REVOCATION_LOCK = 1_792_930_400;

interface TokenRow {
  readonly secret_hash: string;
  readonly issued_at: Date;
  readonly expires_at: Date;
  readonly constraints: string;
}

export class PostgresFleetRegistry implements FleetRegistry {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async addToken(token: EnrollmentToken): Promise<Result<void>> {
    const inserted = await this.#session.query(
      `INSERT INTO enrollment_tokens (secret_hash, issued_at, expires_at, constraints) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [token.hash, token.issuedAt, token.expiresAt, encodeRecord(token.constraints)],
    );
    return inserted.rowCount === 0 ? err(failure('conflict', 'the enrollment token exists')) : ok(undefined);
  }

  async unusedToken(hash: SecretHash): Promise<Result<EnrollmentToken | undefined>> {
    const { rows } = await this.#session.query<TokenRow>(
      'SELECT secret_hash, issued_at, expires_at, constraints FROM enrollment_tokens WHERE secret_hash = $1 AND used_at IS NULL',
      [hash],
    );
    const row = rows[0];
    if (row === undefined) return ok(undefined);
    return ok(Object.freeze({
      hash: row.secret_hash as SecretHash,
      issuedAt: instant(row.issued_at),
      expiresAt: instant(row.expires_at),
      constraints: decodeRecord<HostConstraints>(row.constraints),
    }));
  }

  async enroll(tokenHash: SecretHash, worker: EnrolledWorker): Promise<Result<void>> {
    const { rows } = await this.#session.query<{ expired: boolean }>(
      `UPDATE enrollment_tokens SET used_at = now() WHERE secret_hash = $1 AND used_at IS NULL
       RETURNING expires_at <= now() AS expired`,
      [tokenHash],
    );
    if (rows[0] === undefined) return err(failure('conflict', 'the enrollment token was used', { reason: 'token-used' }));
    if (rows[0].expired) return err(failure('conflict', 'the enrollment token expired', { reason: 'token-expired' }));
    const journal = await this.#session.query('SELECT 1 FROM workers WHERE journal_id = $1', [worker.journalId]);
    if (journal.rowCount !== 0) return err(failure('conflict', 'the journal is enrolled', { reason: 'journal-enrolled' }));
    const { capacity } = worker;
    const inserted = await this.#session.query(
      `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores, memory_mebibytes,
         controls, journal_id, enrollment)
       VALUES ($1, true, false, false, false, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [worker.workerId, capacity.slots, capacity.cpuMillicores, capacity.memoryMebibytes, [...capacity.controls], worker.journalId, encodeRecord(worker)],
    );
    return inserted.rowCount === 0 ? err(failure('conflict', `worker ${worker.workerId} exists`)) : ok(undefined);
  }

  async worker(workerId: WorkerId): Promise<Result<EnrolledWorker | undefined>> {
    return ok(await this.#read(workerId, ''));
  }

  async rotate(
    workerId: WorkerId,
    expectedGeneration: number,
    next: CredentialGeneration,
    validUntil: Instant,
    at: Instant,
  ): Promise<Result<void>> {
    const worker = await this.#read(workerId, 'FOR UPDATE');
    if (worker === undefined) return err(failure('not-found', `no worker ${workerId} is enrolled`));
    if (worker.revokedAt !== undefined) return err(failure('forbidden', `worker ${workerId} is revoked`));
    if (worker.credentials.current.generation !== expectedGeneration) {
      return err(failure('conflict', `the current generation is ${worker.credentials.current.generation}`));
    }
    const rotation = rotateCredentials(worker.credentials, next, validUntil);
    if (rotation.dropped !== undefined) await this.#record(workerId, [rotation.dropped], at);
    await this.#write(workerId, { ...worker, credentials: rotation.credentials });
    return ok(undefined);
  }

  async revoke(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    const worker = await this.#read(workerId, 'FOR UPDATE');
    if (worker === undefined) return err(failure('not-found', `no worker ${workerId} is enrolled`));
    if (worker.revokedAt !== undefined) return ok(undefined);
    await this.#record(workerId, brokerUserKeys(worker.credentials), at);
    await this.#session.query('UPDATE workers SET revoked = true WHERE worker_id = $1', [workerId]);
    await this.#write(workerId, { ...worker, revokedAt: at });
    return ok(undefined);
  }

  async expirePredecessors(now: Instant): Promise<Result<number>> {
    const { rows } = await this.#session.query<{ enrollment: string }>(
      'SELECT enrollment FROM workers WHERE predecessor_valid_until <= $1 ORDER BY worker_id FOR UPDATE',
      [now],
    );
    for (const row of rows) {
      const worker = decodeRecord<EnrolledWorker>(row.enrollment);
      const previous = worker.credentials.previous!;
      await this.#record(worker.workerId, [previous.brokerUserKey], previous.validUntil);
      await this.#write(worker.workerId, { ...worker, credentials: { current: worker.credentials.current } });
    }
    return ok(rows.length);
  }

  // The advisory lock makes publishers take turns; a rerun of the whole
  // transaction pushes the same complete list again, which is harmless.
  async publishRevocations(push: (revocations: readonly BrokerRevocation[]) => Promise<Result<void>>): Promise<Result<number>> {
    await this.#session.query('SELECT pg_advisory_xact_lock($1)', [REVOCATION_LOCK]);
    const { rows } = await this.#session.query<{ user_key: string; revoked_at: Date; published: boolean }>(
      'SELECT user_key, revoked_at, published FROM broker_revocations ORDER BY user_key',
    );
    const unpublished = rows.filter((row) => !row.published).length;
    if (unpublished === 0) return ok(0);
    const pushed = await push(rows.map((row) => Object.freeze({ userKey: row.user_key, revokedAt: instant(row.revoked_at) })));
    if (!pushed.ok) return pushed;
    await this.#session.query('UPDATE broker_revocations SET published = true WHERE NOT published');
    return ok(unpublished);
  }

  async #record(workerId: WorkerId, userKeys: readonly string[], at: Instant): Promise<void> {
    for (const userKey of userKeys) {
      await this.#session.query(
        'INSERT INTO broker_revocations (user_key, worker_id, revoked_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userKey, workerId, at],
      );
    }
  }

  async #write(workerId: WorkerId, worker: EnrolledWorker): Promise<void> {
    await this.#session.query('UPDATE workers SET enrollment = $2, predecessor_valid_until = $3 WHERE worker_id = $1', [
      workerId, encodeRecord(worker), worker.credentials.previous?.validUntil ?? null,
    ]);
  }

  async #read(workerId: WorkerId, lock: '' | 'FOR UPDATE'): Promise<EnrolledWorker | undefined> {
    const { rows } = await this.#session.query<{ enrollment: string }>(
      `SELECT enrollment FROM workers WHERE worker_id = $1 AND enrollment IS NOT NULL ${lock}`,
      [workerId],
    );
    return rows[0] === undefined ? undefined : decodeRecord<EnrolledWorker>(rows[0].enrollment);
  }
}

// The row the scheduling guard reads gets the identity at initialization,
// not quarantined; only G6's restore procedure quarantines it.
export class PostgresInstallationTable implements InstallationTable {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async read(): Promise<Result<InstallationIdentity | undefined>> {
    const { rows } = await this.#session.query<{ installation_id: string; recovery_epoch: number }>(
      'SELECT installation_id, recovery_epoch FROM installation WHERE installation_id IS NOT NULL',
    );
    const row = rows[0];
    return row === undefined ? ok(undefined) : installationIdentity(row.installation_id, row.recovery_epoch);
  }

  async initialize(identity: InstallationIdentity): Promise<Result<void>> {
    const inserted = await this.#session.query(
      `INSERT INTO installation (singleton, quarantined, installation_id, recovery_epoch) VALUES (true, false, $1, $2)
       ON CONFLICT DO NOTHING`,
      [identity.installationId, identity.recoveryEpoch],
    );
    return inserted.rowCount === 0 ? err(failure('conflict', 'the installation is initialized')) : ok(undefined);
  }
}

interface CredentialRow {
  readonly generation: number;
  readonly secret_hash: string;
  readonly issued_at: Date;
}

interface AuditRow {
  readonly kind: AuditEvent['kind'];
  readonly generation: number;
  readonly actor: string;
  readonly reason: string;
  readonly occurred_at: Date;
}

export class PostgresOperatorCredentials implements OperatorCredentials {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async current(): Promise<Result<OperatorCredential | undefined>> {
    const { rows } = await this.#session.query<CredentialRow>('SELECT generation, secret_hash, issued_at FROM operator_credentials');
    const row = rows[0];
    if (row === undefined) return ok(undefined);
    return ok(Object.freeze({ generation: row.generation, hash: row.secret_hash as SecretHash, issuedAt: instant(row.issued_at) }));
  }

  async install(next: OperatorCredential, event: AuditEvent): Promise<Result<void>> {
    if (event.generation !== next.generation) return err(failure('conflict', 'the audit event names another generation'));
    const written = next.generation === 1
      ? await this.#session.query(
        `INSERT INTO operator_credentials (singleton, generation, secret_hash, issued_at) VALUES (true, 1, $1, $2)
         ON CONFLICT DO NOTHING`,
        [next.hash, next.issuedAt],
      )
      : await this.#session.query(
        'UPDATE operator_credentials SET generation = $1, secret_hash = $2, issued_at = $3 WHERE generation = $4',
        [next.generation, next.hash, next.issuedAt, next.generation - 1],
      );
    if (written.rowCount === 0) return err(failure('conflict', `generation ${next.generation} is not the next operator credential`));
    await this.#session.query(
      'INSERT INTO audit_events (kind, generation, actor, reason, occurred_at) VALUES ($1, $2, $3, $4, $5)',
      [event.kind, event.generation, event.actor, event.reason, event.occurredAt],
    );
    return ok(undefined);
  }

  async auditTrail(): Promise<Result<readonly AuditEvent[]>> {
    const { rows } = await this.#session.query<AuditRow>(
      'SELECT kind, generation, actor, reason, occurred_at FROM audit_events ORDER BY position',
    );
    return ok(rows.map((row) => Object.freeze({
      kind: row.kind, generation: row.generation, actor: row.actor, reason: row.reason, occurredAt: instant(row.occurred_at),
    })));
  }
}
