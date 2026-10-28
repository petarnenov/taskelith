import type {
  AccessAudit,
  AccessAuditEvent,
  AccessStore,
  AccessTransaction,
  LoginName,
  PasswordHash,
  Principal,
  PrincipalId,
  Principals,
  ProjectRole,
  ProjectRoleGrant,
  ProjectRoles,
  Role,
  SecretHash,
  Sessions,
  StoredSession,
} from '@taskelith/access';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { instant } from './capacity-repositories.js';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

// The Access module's stores over one transaction's session.
export class PostgresAccessTransaction implements AccessTransaction {
  readonly principals: Principals;
  readonly projectRoles: ProjectRoles;
  readonly sessions: Sessions;
  readonly audit: AccessAudit;

  constructor(session: Session) {
    this.principals = new PostgresPrincipals(session);
    this.projectRoles = new PostgresProjectRoles(session);
    this.sessions = new PostgresSessions(session);
    this.audit = new PostgresAccessAudit(session);
  }
}

// Each transaction is SERIALIZABLE, with the database's retries; a unique
// violation, such as a second owner binding, is `conflict`.
export class PostgresAccessStore implements AccessStore {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  transaction<Value>(work: (tx: AccessTransaction) => Promise<Result<Value>>): Promise<Result<Value>> {
    return this.#database.transaction((tx) => work(tx.access));
  }
}

interface PrincipalRow {
  readonly principal_id: string;
  readonly kind: string;
  readonly login_name: string;
  readonly password_hash: string | null;
  readonly created_at: Date;
  readonly disabled_at: Date | null;
}

const PRINCIPAL_COLUMNS = 'principal_id, kind, login_name, password_hash, created_at, disabled_at';

// A row of a kind this release does not know is refused, never relabelled.
function principalOf(row: PrincipalRow | undefined): Result<Principal | undefined> {
  if (row === undefined) return ok(undefined);
  if (row.kind !== 'operator') return err(failure('internal', `the principal ${row.principal_id} has an unknown kind`));
  return ok(Object.freeze({
    principalId: row.principal_id as PrincipalId, kind: row.kind, loginName: row.login_name as LoginName,
    ...(row.password_hash === null ? {} : { passwordHash: row.password_hash as PasswordHash }),
    createdAt: instant(row.created_at),
    ...(row.disabled_at === null ? {} : { disabledAt: instant(row.disabled_at) }),
  }));
}

const unknownPrincipal = (principalId: PrincipalId) => err(failure('not-found', `no principal ${principalId}`, { principal: principalId }));

class PostgresPrincipals implements Principals {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async add(principal: Principal): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      `INSERT INTO principals (principal_id, kind, login_name, password_hash, created_at, disabled_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [principal.principalId, principal.kind, principal.loginName, principal.passwordHash ?? null, principal.createdAt, principal.disabledAt ?? null],
    );
    if (rowCount === 0) return err(failure('conflict', `the principal ${principal.principalId} or its login name exists`));
    return ok(undefined);
  }

  async get(principalId: PrincipalId): Promise<Result<Principal | undefined>> {
    const { rows } = await this.#session.query<PrincipalRow>(`SELECT ${PRINCIPAL_COLUMNS} FROM principals WHERE principal_id = $1`, [principalId]);
    return principalOf(rows[0]);
  }

  async findByLoginName(loginName: LoginName): Promise<Result<Principal | undefined>> {
    const { rows } = await this.#session.query<PrincipalRow>(`SELECT ${PRINCIPAL_COLUMNS} FROM principals WHERE login_name = $1`, [loginName]);
    return principalOf(rows[0]);
  }

  async setPasswordHash(principalId: PrincipalId, hash: PasswordHash): Promise<Result<void>> {
    const { rowCount } = await this.#session.query('UPDATE principals SET password_hash = $2 WHERE principal_id = $1', [principalId, hash]);
    return rowCount === 0 ? unknownPrincipal(principalId) : ok(undefined);
  }

  async grantInstallationOwner(principalId: PrincipalId, grantedAt: Instant): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      `INSERT INTO installation_roles (principal_id, role, granted_at)
       SELECT principal_id, 'installation-owner', $2 FROM principals WHERE principal_id = $1
       ON CONFLICT DO NOTHING`,
      [principalId, grantedAt],
    );
    if (rowCount === 0 && !(await this.#exists(principalId))) return unknownPrincipal(principalId);
    return ok(undefined);
  }

  async isInstallationOwner(principalId: PrincipalId): Promise<Result<boolean>> {
    const { rows } = await this.#session.query('SELECT 1 FROM installation_roles WHERE principal_id = $1', [principalId]);
    return ok(rows.length > 0);
  }

  async bindOperator(principalId: PrincipalId): Promise<Result<void>> {
    if (!(await this.#exists(principalId))) return unknownPrincipal(principalId);
    const { rowCount } = await this.#session.query(
      'INSERT INTO operator_principal (singleton, principal_id) VALUES (true, $1) ON CONFLICT DO NOTHING',
      [principalId],
    );
    return rowCount === 0 ? err(failure('conflict', 'a principal is already bound to the operator credential')) : ok(undefined);
  }

  async operatorPrincipal(): Promise<Result<PrincipalId | undefined>> {
    const { rows } = await this.#session.query<{ principal_id: string }>('SELECT principal_id FROM operator_principal');
    return ok(rows[0]?.principal_id as PrincipalId | undefined);
  }

  async #exists(principalId: PrincipalId): Promise<boolean> {
    const { rows } = await this.#session.query('SELECT 1 FROM principals WHERE principal_id = $1', [principalId]);
    return rows.length > 0;
  }
}

class PostgresProjectRoles implements ProjectRoles {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async roleOf(projectId: string, principalId: PrincipalId): Promise<Result<ProjectRole | undefined>> {
    const { rows } = await this.#session.query<{ role: ProjectRole }>(
      'SELECT role FROM project_roles WHERE project_id = $1 AND principal_id = $2',
      [projectId, principalId],
    );
    return ok(rows[0]?.role);
  }

  async assign(projectId: string, principalId: PrincipalId, role: ProjectRole, assignedAt: Instant): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      `INSERT INTO project_roles (project_id, principal_id, role, assigned_at)
       SELECT $1, principal_id, $3, $4 FROM principals WHERE principal_id = $2
       ON CONFLICT (project_id, principal_id) DO UPDATE SET role = EXCLUDED.role, assigned_at = EXCLUDED.assigned_at`,
      [projectId, principalId, role, assignedAt],
    );
    return rowCount === 0 ? unknownPrincipal(principalId) : ok(undefined);
  }

  async remove(projectId: string, principalId: PrincipalId): Promise<Result<boolean>> {
    const { rowCount } = await this.#session.query('DELETE FROM project_roles WHERE project_id = $1 AND principal_id = $2', [projectId, principalId]);
    return ok((rowCount ?? 0) > 0);
  }

  async projectsOf(principalId: PrincipalId): Promise<Result<readonly ProjectRoleGrant[]>> {
    const { rows } = await this.#session.query<{ project_id: string; role: ProjectRole }>(
      'SELECT project_id, role FROM project_roles WHERE principal_id = $1 ORDER BY project_id COLLATE "C"',
      [principalId],
    );
    return ok(rows.map((row) => Object.freeze({ projectId: row.project_id, role: row.role })));
  }
}

interface SessionRow {
  readonly id_hash: string;
  readonly csrf_token: string;
  readonly principal_id: string | null;
  readonly created_at: Date;
  readonly authenticated_at: Date | null;
  readonly last_seen_at: Date;
  readonly idle_expires_at: Date;
  readonly absolute_expires_at: Date;
  readonly ended_at: Date | null;
}

function sessionOf(row: SessionRow): StoredSession {
  return Object.freeze({
    idHash: row.id_hash as SecretHash, csrfToken: row.csrf_token,
    ...(row.principal_id === null ? {} : { principalId: row.principal_id as PrincipalId }),
    createdAt: instant(row.created_at),
    ...(row.authenticated_at === null ? {} : { authenticatedAt: instant(row.authenticated_at) }),
    lastSeenAt: instant(row.last_seen_at), idleExpiresAt: instant(row.idle_expires_at), absoluteExpiresAt: instant(row.absolute_expires_at),
    ...(row.ended_at === null ? {} : { endedAt: instant(row.ended_at) }),
  });
}

function sessionValues(session: StoredSession): unknown[] {
  return [
    session.idHash, session.csrfToken, session.principalId ?? null, session.createdAt, session.authenticatedAt ?? null,
    session.lastSeenAt, session.idleExpiresAt, session.absoluteExpiresAt, session.endedAt ?? null,
  ];
}

const noSession = () => err(failure('not-found', 'no open session has this identifier'));

class PostgresSessions implements Sessions {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async add(session: StoredSession): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      `INSERT INTO browser_sessions (id_hash, csrf_token, principal_id, created_at, authenticated_at, last_seen_at,
         idle_expires_at, absolute_expires_at, ended_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      sessionValues(session),
    );
    return rowCount === 0 ? err(failure('conflict', 'a session has this identifier')) : ok(undefined);
  }

  async get(idHash: SecretHash): Promise<Result<StoredSession | undefined>> {
    const { rows } = await this.#session.query<SessionRow>('SELECT * FROM browser_sessions WHERE id_hash = $1', [idHash]);
    return ok(rows[0] === undefined ? undefined : sessionOf(rows[0]));
  }

  async replace(idHash: SecretHash, next: StoredSession): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      `UPDATE browser_sessions SET id_hash = $1, csrf_token = $2, principal_id = $3, created_at = $4, authenticated_at = $5,
         last_seen_at = $6, idle_expires_at = $7, absolute_expires_at = $8, ended_at = $9
       WHERE id_hash = $10 AND ended_at IS NULL`,
      [...sessionValues(next), idHash],
    );
    return rowCount === 0 ? noSession() : ok(undefined);
  }

  async touch(idHash: SecretHash, lastSeenAt: Instant, idleExpiresAt: Instant): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      'UPDATE browser_sessions SET last_seen_at = $2, idle_expires_at = $3 WHERE id_hash = $1 AND ended_at IS NULL',
      [idHash, lastSeenAt, idleExpiresAt],
    );
    return rowCount === 0 ? noSession() : ok(undefined);
  }

  async end(idHash: SecretHash, endedAt: Instant): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      'UPDATE browser_sessions SET ended_at = $2 WHERE id_hash = $1 AND ended_at IS NULL',
      [idHash, endedAt],
    );
    return rowCount === 0 ? noSession() : ok(undefined);
  }

  async endAllOf(principalId: PrincipalId, endedAt: Instant, except?: SecretHash): Promise<Result<number>> {
    const { rowCount } = await this.#session.query(
      `UPDATE browser_sessions SET ended_at = $2
       WHERE principal_id = $1 AND ended_at IS NULL AND id_hash IS DISTINCT FROM $3`,
      [principalId, endedAt, except ?? null],
    );
    return ok(rowCount ?? 0);
  }

  async purge(now: Instant, limit: number): Promise<Result<number>> {
    const { rowCount } = await this.#session.query(
      `DELETE FROM browser_sessions WHERE id_hash IN (
         SELECT id_hash FROM browser_sessions
         WHERE ended_at IS NOT NULL OR idle_expires_at <= $1 OR absolute_expires_at <= $1 LIMIT $2)`,
      [now, limit],
    );
    return ok(rowCount ?? 0);
  }

  async trimAnonymous(cap: number, limit: number): Promise<Result<number>> {
    const { rowCount } = await this.#session.query(
      `DELETE FROM browser_sessions WHERE id_hash IN (
         SELECT id_hash FROM (
           SELECT id_hash, created_at FROM browser_sessions WHERE principal_id IS NULL
           ORDER BY created_at DESC, id_hash OFFSET $1) AS excess
         ORDER BY created_at, id_hash DESC LIMIT $2)`,
      [cap, limit],
    );
    return ok(rowCount ?? 0);
  }
}

interface AuditRow {
  readonly kind: AccessAuditEvent['kind'];
  readonly principal_id: string | null;
  readonly project_id: string | null;
  readonly role: Role | null;
  readonly actor: string;
  readonly reason: string;
  readonly occurred_at: Date;
}

class PostgresAccessAudit implements AccessAudit {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async append(event: AccessAuditEvent): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO access_audit_events (kind, principal_id, project_id, role, actor, reason, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.kind, event.principalId ?? null, event.projectId ?? null, event.role ?? null, event.actor, event.reason, event.occurredAt],
    );
    return ok(undefined);
  }

  async trail(): Promise<Result<readonly AccessAuditEvent[]>> {
    const { rows } = await this.#session.query<AuditRow>(
      'SELECT kind, principal_id, project_id, role, actor, reason, occurred_at FROM access_audit_events ORDER BY position',
    );
    return ok(rows.map((row) => Object.freeze({
      kind: row.kind,
      ...(row.principal_id === null ? {} : { principalId: row.principal_id as PrincipalId }),
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      ...(row.role === null ? {} : { role: row.role }),
      actor: row.actor, reason: row.reason, occurredAt: instant(row.occurred_at),
    })));
  }
}
