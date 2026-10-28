import type { Instant, Result } from '@taskelith/kernel';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { LoginName, PasswordHash, Principal, PrincipalId } from '../domain/principal.js';
import type { ProjectRole } from '../domain/roles.js';
import type { SecretHash } from '../domain/secret-hash.js';
import type { StoredSession } from '../domain/session.js';

// Principals, roles, sessions, and their audit trail. `transaction` commits
// the work's writes only when it answers ok, and serializes concurrent work.
export interface AccessStore {
  transaction<Value>(work: (tx: AccessTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

export interface AccessTransaction {
  readonly principals: Principals;
  readonly projectRoles: ProjectRoles;
  readonly sessions: Sessions;
  readonly audit: AccessAudit;
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

export interface ProjectRoleGrant {
  readonly projectId: string;
  readonly role: ProjectRole;
}

// At most one role per principal and project; `assign` replaces it, and
// `remove` answers whether there was one.
export interface ProjectRoles {
  roleOf(projectId: string, principalId: PrincipalId): Promise<Result<ProjectRole | undefined>>;
  assign(projectId: string, principalId: PrincipalId, role: ProjectRole, assignedAt: Instant): Promise<Result<void>>;
  remove(projectId: string, principalId: PrincipalId): Promise<Result<boolean>>;
  // In project identifier order.
  projectsOf(principalId: PrincipalId): Promise<Result<readonly ProjectRoleGrant[]>>;
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
  // Deletes the oldest anonymous sessions beyond `cap`; answers how many.
  trimAnonymous(cap: number): Promise<Result<number>>;
}

// Append-only, in the order of appending.
export interface AccessAudit {
  append(event: AccessAuditEvent): Promise<Result<void>>;
  trail(): Promise<Result<readonly AccessAuditEvent[]>>;
}
