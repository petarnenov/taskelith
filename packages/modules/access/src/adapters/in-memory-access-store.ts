import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { LoginName, PasswordHash, Principal, PrincipalId } from '../domain/principal.js';
import type { ProjectRole } from '../domain/roles.js';
import type { SecretHash } from '../domain/secret-hash.js';
import { isLive, type StoredSession } from '../domain/session.js';
import type {
  AccessAudit,
  AccessStore,
  AccessTransaction,
  Principals,
  ProjectRoleGrant,
  ProjectRoles,
  Sessions,
} from '../ports/access-store.js';

interface RoleRow extends ProjectRoleGrant {
  readonly principalId: PrincipalId;
  readonly assignedAt: Instant;
}

interface State {
  readonly principals: Map<PrincipalId, Principal>;
  readonly owners: Map<PrincipalId, Instant>;
  operator: PrincipalId | undefined;
  readonly roles: Map<string, RoleRow>;
  readonly sessions: Map<SecretHash, StoredSession>;
  readonly audit: AccessAuditEvent[];
}

function copy(state: State): State {
  return {
    principals: new Map(state.principals), owners: new Map(state.owners), operator: state.operator,
    roles: new Map(state.roles), sessions: new Map(state.sessions), audit: [...state.audit],
  };
}

// One transaction at a time over a copy of the state, which replaces the
// state only when the work answers ok.
export class InMemoryAccessStore implements AccessStore {
  #state: State = {
    principals: new Map(), owners: new Map(), operator: undefined, roles: new Map(), sessions: new Map(), audit: [],
  };

  #queue: Promise<unknown> = Promise.resolve();

  transaction<Value>(work: (tx: AccessTransaction) => Promise<Result<Value>>): Promise<Result<Value>> {
    const run = async (): Promise<Result<Value>> => {
      const draft = copy(this.#state);
      const result = await work(transactionOver(draft));
      if (result.ok) this.#state = draft;
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}

function transactionOver(state: State): AccessTransaction {
  return {
    principals: new MemoryPrincipals(state),
    projectRoles: new MemoryProjectRoles(state),
    sessions: new MemorySessions(state),
    audit: new MemoryAudit(state),
  };
}

const unknownPrincipal = (principalId: PrincipalId) => err(failure('not-found', `no principal ${principalId}`, { principal: principalId }));

class MemoryPrincipals implements Principals {
  constructor(private readonly state: State) {}

  async add(principal: Principal): Promise<Result<void>> {
    const taken = [...this.state.principals.values()].some((known) => known.loginName === principal.loginName);
    if (taken || this.state.principals.has(principal.principalId)) {
      return err(failure('conflict', `the principal ${principal.principalId} or its login name exists`));
    }
    this.state.principals.set(principal.principalId, Object.freeze({ ...principal }));
    return ok(undefined);
  }

  async get(principalId: PrincipalId): Promise<Result<Principal | undefined>> {
    return ok(this.state.principals.get(principalId));
  }

  async findByLoginName(loginName: LoginName): Promise<Result<Principal | undefined>> {
    return ok([...this.state.principals.values()].find((principal) => principal.loginName === loginName));
  }

  async setPasswordHash(principalId: PrincipalId, passwordHash: PasswordHash): Promise<Result<void>> {
    const principal = this.state.principals.get(principalId);
    if (principal === undefined) return unknownPrincipal(principalId);
    this.state.principals.set(principalId, Object.freeze({ ...principal, passwordHash }));
    return ok(undefined);
  }

  async grantInstallationOwner(principalId: PrincipalId, grantedAt: Instant): Promise<Result<void>> {
    if (!this.state.principals.has(principalId)) return unknownPrincipal(principalId);
    if (!this.state.owners.has(principalId)) this.state.owners.set(principalId, grantedAt);
    return ok(undefined);
  }

  async isInstallationOwner(principalId: PrincipalId): Promise<Result<boolean>> {
    return ok(this.state.owners.has(principalId));
  }

  async bindOperator(principalId: PrincipalId): Promise<Result<void>> {
    if (!this.state.principals.has(principalId)) return unknownPrincipal(principalId);
    if (this.state.operator !== undefined) return err(failure('conflict', 'a principal is already bound to the operator credential'));
    this.state.operator = principalId;
    return ok(undefined);
  }

  async operatorPrincipal(): Promise<Result<PrincipalId | undefined>> {
    return ok(this.state.operator);
  }
}

const roleKey = (projectId: string, principalId: PrincipalId) => JSON.stringify([projectId, principalId]);

class MemoryProjectRoles implements ProjectRoles {
  constructor(private readonly state: State) {}

  async roleOf(projectId: string, principalId: PrincipalId): Promise<Result<ProjectRole | undefined>> {
    return ok(this.state.roles.get(roleKey(projectId, principalId))?.role);
  }

  async assign(projectId: string, principalId: PrincipalId, role: ProjectRole, assignedAt: Instant): Promise<Result<void>> {
    if (!this.state.principals.has(principalId)) return unknownPrincipal(principalId);
    this.state.roles.set(roleKey(projectId, principalId), Object.freeze({ projectId, principalId, role, assignedAt }));
    return ok(undefined);
  }

  async remove(projectId: string, principalId: PrincipalId): Promise<Result<boolean>> {
    return ok(this.state.roles.delete(roleKey(projectId, principalId)));
  }

  async projectsOf(principalId: PrincipalId): Promise<Result<readonly ProjectRoleGrant[]>> {
    const grants = [...this.state.roles.values()]
      .filter((row) => row.principalId === principalId)
      .map(({ projectId, role }) => Object.freeze({ projectId, role }));
    return ok(grants.sort((left, right) => (left.projectId < right.projectId ? -1 : 1)));
  }
}

class MemorySessions implements Sessions {
  constructor(private readonly state: State) {}

  async add(session: StoredSession): Promise<Result<void>> {
    if (this.state.sessions.has(session.idHash)) return err(failure('conflict', 'a session has this identifier'));
    this.state.sessions.set(session.idHash, Object.freeze({ ...session }));
    return ok(undefined);
  }

  async get(idHash: SecretHash): Promise<Result<StoredSession | undefined>> {
    return ok(this.state.sessions.get(idHash));
  }

  async replace(idHash: SecretHash, next: StoredSession): Promise<Result<void>> {
    if (this.#open(idHash) === undefined) return noSession();
    if (next.idHash !== idHash && this.state.sessions.has(next.idHash)) return err(failure('conflict', 'a session has this identifier'));
    this.state.sessions.delete(idHash);
    this.state.sessions.set(next.idHash, Object.freeze({ ...next }));
    return ok(undefined);
  }

  async touch(idHash: SecretHash, lastSeenAt: Instant, idleExpiresAt: Instant): Promise<Result<void>> {
    const session = this.#open(idHash);
    if (session === undefined) return noSession();
    this.state.sessions.set(idHash, Object.freeze({ ...session, lastSeenAt, idleExpiresAt }));
    return ok(undefined);
  }

  async end(idHash: SecretHash, endedAt: Instant): Promise<Result<void>> {
    const session = this.#open(idHash);
    if (session === undefined) return noSession();
    this.state.sessions.set(idHash, Object.freeze({ ...session, endedAt }));
    return ok(undefined);
  }

  async endAllOf(principalId: PrincipalId, endedAt: Instant, except?: SecretHash): Promise<Result<number>> {
    const ending = [...this.state.sessions.values()].filter((session) =>
      session.principalId === principalId && session.endedAt === undefined && session.idHash !== except);
    for (const session of ending) this.state.sessions.set(session.idHash, Object.freeze({ ...session, endedAt }));
    return ok(ending.length);
  }

  async purge(now: Instant, limit: number): Promise<Result<number>> {
    const purged = [...this.state.sessions.values()].filter((session) => !isLive(session, now)).slice(0, limit);
    for (const session of purged) this.state.sessions.delete(session.idHash);
    return ok(purged.length);
  }

  async trimAnonymous(cap: number): Promise<Result<number>> {
    const anonymous = [...this.state.sessions.values()]
      .filter((session) => session.principalId === undefined)
      .sort((left, right) => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0));
    const excess = anonymous.slice(0, Math.max(0, anonymous.length - cap));
    for (const session of excess) this.state.sessions.delete(session.idHash);
    return ok(excess.length);
  }

  #open(idHash: SecretHash): StoredSession | undefined {
    const session = this.state.sessions.get(idHash);
    return session?.endedAt === undefined ? session : undefined;
  }
}

const noSession = () => err(failure('not-found', 'no open session has this identifier'));

class MemoryAudit implements AccessAudit {
  constructor(private readonly state: State) {}

  async append(event: AccessAuditEvent): Promise<Result<void>> {
    this.state.audit.push(Object.freeze({ ...event }));
    return ok(undefined);
  }

  async trail(): Promise<Result<readonly AccessAuditEvent[]>> {
    return ok([...this.state.audit]);
  }
}
