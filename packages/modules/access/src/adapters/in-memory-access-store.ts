import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { LoginName, PasswordHash, Principal, PrincipalId } from '../domain/principal.js';
import {
  AUTO_MERGE_STARTS_ON,
  FIRST_REVISION,
  revisionConflict,
  unknownProject,
  type Project,
  type ProjectDefaults,
  type SettingChange,
  type StoredAutoMergeSetting,
  type StoredDefaults,
} from '../domain/project.js';
import type { ProjectRole } from '../domain/roles.js';
import type { SecretHash } from '../domain/secret-hash.js';
import { isLive, type StoredSession } from '../domain/session.js';
import type {
  AccessAudit,
  AccessStore,
  AccessTransaction,
  Principals,
  ProjectMembership,
  ProjectQuery,
  ProjectRoleGrant,
  ProjectRoles,
  Projects,
  Sessions,
} from '../ports/access-store.js';

interface RoleRow extends ProjectRoleGrant {
  readonly principalId: PrincipalId;
  readonly assignedAt: Instant;
}

interface ProjectRow {
  readonly project: Project;
  readonly defaults: StoredDefaults;
  readonly autoMerge: StoredAutoMergeSetting;
}

interface State {
  readonly principals: Map<PrincipalId, Principal>;
  readonly projects: Map<string, ProjectRow>;
  readonly owners: Map<PrincipalId, Instant>;
  operator: PrincipalId | undefined;
  readonly roles: Map<string, RoleRow>;
  readonly sessions: Map<SecretHash, StoredSession>;
  readonly audit: AccessAuditEvent[];
}

function copy(state: State): State {
  return {
    principals: new Map(state.principals), projects: new Map(state.projects), owners: new Map(state.owners), operator: state.operator,
    roles: new Map(state.roles), sessions: new Map(state.sessions), audit: [...state.audit],
  };
}

// One transaction at a time over a copy of the state, which replaces the
// state only when the work answers ok.
export class InMemoryAccessStore implements AccessStore {
  #state: State = {
    principals: new Map(), projects: new Map(), owners: new Map(), operator: undefined, roles: new Map(), sessions: new Map(), audit: [],
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
    projects: new MemoryProjects(state),
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

// Code-unit order, as wire contracts section 6 pages lists.
const byCodeUnits = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

class MemoryProjects implements Projects {
  constructor(private readonly state: State) {}

  async add(project: Project, defaults: ProjectDefaults): Promise<Result<void>> {
    if (this.state.projects.has(project.projectId)) return err(failure('conflict', `the project ${project.projectId} exists`));
    this.state.projects.set(project.projectId, Object.freeze({
      project: Object.freeze({ ...project }),
      defaults: Object.freeze({ defaults, revision: FIRST_REVISION }),
      autoMerge: Object.freeze({ enabled: AUTO_MERGE_STARTS_ON, revision: FIRST_REVISION }),
    }));
    return ok(undefined);
  }

  async get(projectId: string): Promise<Result<Project | undefined>> {
    return ok(this.state.projects.get(projectId)?.project);
  }

  async page({ after, limit, memberOf }: ProjectQuery): Promise<Result<readonly Project[]>> {
    const member = (projectId: string) => memberOf === undefined || this.state.roles.has(roleKey(projectId, memberOf));
    const projects = [...this.state.projects.values()].map((row) => row.project)
      .filter((project) => (after === undefined || project.projectId > after) && member(project.projectId))
      .sort((left, right) => byCodeUnits(left.projectId, right.projectId));
    return ok(projects.slice(0, limit));
  }

  async rename(projectId: string, expectedRevision: number, name: string): Promise<Result<Project>> {
    const row = this.state.projects.get(projectId);
    if (row === undefined) return unknownProject();
    if (row.project.revision !== expectedRevision) return revisionConflict('project');
    const project = Object.freeze({ ...row.project, name, revision: expectedRevision + 1 });
    this.state.projects.set(projectId, Object.freeze({ ...row, project }));
    return ok(project);
  }

  async defaults(projectId: string): Promise<Result<StoredDefaults | undefined>> {
    return ok(this.state.projects.get(projectId)?.defaults);
  }

  async replaceDefaults(
    projectId: string, expectedRevision: number, defaults: ProjectDefaults, lastChange: SettingChange,
  ): Promise<Result<StoredDefaults>> {
    const row = this.state.projects.get(projectId);
    if (row === undefined) return unknownProject();
    if (row.defaults.revision !== expectedRevision) return revisionConflict('project defaults');
    const stored = Object.freeze({ defaults, revision: expectedRevision + 1, lastChange: Object.freeze({ ...lastChange }) });
    this.state.projects.set(projectId, Object.freeze({ ...row, defaults: stored }));
    return ok(stored);
  }

  async autoMergeSetting(projectId: string): Promise<Result<StoredAutoMergeSetting | undefined>> {
    return ok(this.state.projects.get(projectId)?.autoMerge);
  }
}

class MemoryProjectRoles implements ProjectRoles {
  constructor(private readonly state: State) {}

  async roleOf(projectId: string, principalId: PrincipalId): Promise<Result<ProjectRole | undefined>> {
    return ok(this.state.roles.get(roleKey(projectId, principalId))?.role);
  }

  async assign(projectId: string, principalId: PrincipalId, role: ProjectRole, assignedAt: Instant): Promise<Result<void>> {
    if (!this.state.principals.has(principalId)) return unknownPrincipal(principalId);
    if (!this.state.projects.has(projectId)) return unknownProject();
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
    return ok(grants.sort((left, right) => byCodeUnits(left.projectId, right.projectId)));
  }

  async members(projectId: string, after: string | undefined, limit: number): Promise<Result<readonly ProjectMembership[]>> {
    const members = [...this.state.roles.values()]
      .filter((row) => row.projectId === projectId && (after === undefined || row.principalId > after))
      .sort((left, right) => byCodeUnits(left.principalId, right.principalId))
      .slice(0, limit)
      .map(({ principalId, role }) => Object.freeze({ principalId, loginName: this.state.principals.get(principalId)!.loginName, role }));
    return ok(members);
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

  async trimAnonymous(cap: number, limit: number): Promise<Result<number>> {
    const anonymous = [...this.state.sessions.values()]
      .filter((session) => session.principalId === undefined)
      .sort((left, right) => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0));
    const excess = anonymous.slice(0, Math.min(limit, Math.max(0, anonymous.length - cap)));
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
