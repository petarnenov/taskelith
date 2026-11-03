import type { Instant, Result } from '@taskelith/kernel';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { PrincipalChange } from '../domain/principal-change.js';
import type { LoginName, PasswordHash, Principal, PrincipalId } from '../domain/principal.js';
import type { Project, ProjectDefaults, SettingChange, StoredAutoMergeSetting, StoredDefaults } from '../domain/project.js';
import type { ProjectRole } from '../domain/roles.js';
import type { SecretHash } from '../domain/secret-hash.js';
import type { StoredSession } from '../domain/session.js';

// Principals, projects, roles, sessions, and their audit. `transaction` commits
// the work's writes only when it answers ok, and serializes concurrent work.
export interface AccessStore {
  transaction<Value>(work: (tx: AccessTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

export interface AccessTransaction {
  readonly principals: Principals;
  readonly projects: Projects;
  readonly projectRoles: ProjectRoles;
  readonly sessions: Sessions;
  readonly audit: AccessAudit;
  readonly changes: PrincipalChanges;
}

// `add` is `conflict` for a taken identifier or login name; `bindOperator`
// is `conflict` once a principal is bound to the operator credential.
export interface Principals {
  add(principal: Principal): Promise<Result<void>>;
  get(principalId: PrincipalId): Promise<Result<Principal | undefined>>;
  findByLoginName(loginName: LoginName): Promise<Result<Principal | undefined>>;
  setPasswordHash(principalId: PrincipalId, hash: PasswordHash): Promise<Result<void>>;
  grantInstallationOwner(principalId: PrincipalId, grantedAt: Instant): Promise<Result<void>>;
  isInstallationOwner(principalId: PrincipalId): Promise<Result<boolean>>;
  bindOperator(principalId: PrincipalId): Promise<Result<void>>;
  operatorPrincipal(): Promise<Result<PrincipalId | undefined>>;
}

// Which projects a page holds: every one, or those on which `memberOf`
// holds a role; at most `limit`, after `after`, in code-unit order.
export interface ProjectQuery {
  readonly after?: string;
  readonly limit: number;
  readonly memberOf?: PrincipalId;
}

// `add` is `conflict` for a taken identifier; compare-and-set writes are
// `not-found` for an unknown project and `conflict` for a moved revision.
export interface Projects {
  // Also the defaults and the auto-merge setting, on, at revision 1.
  add(project: Project, defaults: ProjectDefaults): Promise<Result<void>>;
  get(projectId: string): Promise<Result<Project | undefined>>;
  page(query: ProjectQuery): Promise<Result<readonly Project[]>>;
  rename(projectId: string, expectedRevision: number, name: string): Promise<Result<Project>>;
  defaults(projectId: string): Promise<Result<StoredDefaults | undefined>>;
  replaceDefaults(
    projectId: string, expectedRevision: number, defaults: ProjectDefaults, change: SettingChange,
  ): Promise<Result<StoredDefaults>>;
  autoMergeSetting(projectId: string): Promise<Result<StoredAutoMergeSetting | undefined>>;
}

export interface ProjectRoleGrant {
  readonly projectId: string;
  readonly role: ProjectRole;
}

export interface ProjectMembership {
  readonly principalId: PrincipalId;
  readonly loginName: LoginName;
  readonly role: ProjectRole;
}

// At most one role per principal and project; `assign` replaces it, or is
// `not-found` for an unknown principal or project; `remove` answers if any.
export interface ProjectRoles {
  roleOf(projectId: string, principalId: PrincipalId): Promise<Result<ProjectRole | undefined>>;
  assign(projectId: string, principalId: PrincipalId, role: ProjectRole, assignedAt: Instant): Promise<Result<void>>;
  remove(projectId: string, principalId: PrincipalId): Promise<Result<boolean>>;
  // In project identifier order.
  projectsOf(principalId: PrincipalId): Promise<Result<readonly ProjectRoleGrant[]>>;
  // At most `limit` after `after`, in principal identifier code-unit order.
  members(projectId: string, after: string | undefined, limit: number): Promise<Result<readonly ProjectMembership[]>>;
}

// `replace` and `touch` are `not-found` unless a session that has not ended
// has the given hash; `replace` gives it the new hash in the same write.
export interface Sessions {
  add(session: StoredSession): Promise<Result<void>>;
  get(idHash: SecretHash): Promise<Result<StoredSession | undefined>>;
  replace(idHash: SecretHash, next: StoredSession): Promise<Result<void>>;
  touch(idHash: SecretHash, lastSeenAt: Instant, idleExpiresAt: Instant): Promise<Result<void>>;
  end(idHash: SecretHash, endedAt: Instant): Promise<Result<void>>;
  // Ends the principal's live sessions but `except`; answers how many.
  endAllOf(principalId: PrincipalId, endedAt: Instant, except?: SecretHash): Promise<Result<number>>;
  // Deletes at most `limit` ended or expired sessions; answers how many.
  purge(now: Instant, limit: number): Promise<Result<number>>;
  // Deletes at most `limit` of the oldest anonymous sessions beyond `cap`;
  // answers how many.
  trimAnonymous(cap: number, limit: number): Promise<Result<number>>;
}

// Append-only, in the order of appending.
export interface AccessAudit {
  append(event: AccessAuditEvent): Promise<Result<void>>;
  trail(): Promise<Result<readonly AccessAuditEvent[]>>;
}

// The changes that end a principal's event streams, committed with the
// change itself; the event log numbers them with the events.
export interface PrincipalChanges {
  record(change: PrincipalChange): Promise<Result<void>>;
}
