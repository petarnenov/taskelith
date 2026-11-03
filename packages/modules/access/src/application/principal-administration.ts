import { err, failure, ok, parseIdentifier, type Failure, type Instant, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import { checkNewPassword } from '../domain/password-policy.js';
import { rolesChanged, sessionsEnded } from '../domain/principal-change.js';
import { parseLoginName, parsePrincipalId, type Principal, type PrincipalId } from '../domain/principal.js';
import { unknownProject } from '../domain/project.js';
import { OWNER_ONLY } from '../domain/requirement.js';
import { parseProjectRole, type ProjectRole } from '../domain/roles.js';
import type { AccessStore, AccessTransaction } from '../ports/access-store.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RandomValues } from '../ports/random-values.js';
import { authorizeIn } from './authorization-service.js';
import { checkInvocation, type AdministrativeInvocation } from './operator-credential-service.js';

export interface PrincipalAdministrationDependencies {
  readonly store: AccessStore;
  readonly hasher: PasswordHasher;
  readonly random: RandomValues;
  readonly clock: Clock;
}

export interface PrincipalSummary {
  readonly principalId: PrincipalId;
  readonly loginName: string;
}

export interface ProjectRoleChange extends PrincipalSummary {
  readonly projectId: string;
  readonly role?: ProjectRole;
}

export type ProjectRoleAssignment = ProjectRoleChange & { readonly role: ProjectRole };

type Audited = Omit<AccessAuditEvent, 'actor' | 'reason' | 'occurredAt'>;

// The installation-owner's commands over principals (decision 8). Each is
// authorized for the acting principal, then writes its change and audit.
export class PrincipalAdministration {
  readonly #deps: PrincipalAdministrationDependencies;

  constructor(dependencies: PrincipalAdministrationDependencies) {
    this.#deps = dependencies;
  }

  // A principal with no role and no password.
  createPrincipal(actor: PrincipalId, loginNameText: string, invocation: AdministrativeInvocation): Promise<Result<PrincipalSummary>> {
    const loginName = parseLoginName(loginNameText);
    if (!loginName.ok) return Promise.resolve(loginName);
    return this.#command(actor, invocation, async (tx, at) => {
      const principalId = parsePrincipalId(this.#deps.random.principalId());
      if (!principalId.ok) return principalId;
      const principal: Principal = { principalId: principalId.value, kind: 'operator', loginName: loginName.value, createdAt: at };
      const added = await tx.principals.add(principal);
      if (!added.ok) return added;
      const summary = { principalId: principalId.value, loginName: loginName.value };
      return ok({ value: summary, event: { kind: 'access.principal-created', principalId: principalId.value } });
    });
  }

  // Ends every session of the principal in the same write (decision 4).
  async setPassword(
    actor: PrincipalId,
    loginNameText: string,
    password: string,
    invocation: AdministrativeInvocation,
  ): Promise<Result<PrincipalSummary & { readonly sessionsEnded: number }>> {
    const invoked = checkInvocation(invocation);
    if (!invoked.ok) return invoked;
    const loginName = parseLoginName(loginNameText);
    if (!loginName.ok) return loginName;
    const checked = checkNewPassword(password, loginName.value);
    if (!checked.ok) return checked;
    const authorized = await this.#authorized(actor);
    if (!authorized.ok) return authorized;
    const hash = await this.#deps.hasher.hash(checked.value);
    if (!hash.ok) return hash;
    return this.#command(actor, invocation, async (tx, at) => {
      const principal = await principalNamed(tx, loginName.value);
      if (!principal.ok) return principal;
      const { principalId } = principal.value;
      const stored = await tx.principals.setPasswordHash(principalId, hash.value);
      if (!stored.ok) return stored;
      const ended = await tx.sessions.endAllOf(principalId, at);
      if (!ended.ok) return ended;
      const recorded = ended.value === 0 ? ok(undefined) : await tx.changes.record(sessionsEnded(principalId));
      if (!recorded.ok) return recorded;
      const value = { principalId, loginName: loginName.value, sessionsEnded: ended.value };
      return ok({ value, event: { kind: 'access.password-set', principalId } });
    });
  }

  // Replaces the principal's role on the project (wire contracts section 4).
  assignProjectRole(
    actor: PrincipalId,
    target: { readonly projectId: string; readonly loginName: string; readonly role: string },
    invocation: AdministrativeInvocation,
  ): Promise<Result<ProjectRoleAssignment>> {
    const loginName = parseLoginName(target.loginName);
    if (!loginName.ok) return Promise.resolve(loginName);
    return this.#assign(actor, target, (tx) => principalNamed(tx, loginName.value), invocation);
  }

  // `assignProjectMember`: the same command for a principal by identifier.
  assignProjectMember(
    actor: PrincipalId,
    target: { readonly projectId: string; readonly principalId: string; readonly role: string },
    invocation: AdministrativeInvocation,
  ): Promise<Result<ProjectRoleAssignment>> {
    return this.#assign(actor, target, (tx) => principalWithId(tx, target.principalId), invocation);
  }

  // Succeeds for a principal that holds no role; only a removal is audited.
  // Any identifier, so a G2 role on one that names no project stays revocable.
  removeProjectRole(
    actor: PrincipalId,
    target: { readonly projectId: string; readonly loginName: string },
    invocation: AdministrativeInvocation,
  ): Promise<Result<ProjectRoleChange>> {
    const loginName = parseLoginName(target.loginName);
    if (!loginName.ok) return Promise.resolve(loginName);
    const scope = { projectIdText: target.projectId, check: anyProject };
    return this.#roleCommand(actor, scope, invocation, (tx) => principalNamed(tx, loginName.value), removal);
  }

  // `removeProjectMember`: also succeeds for an unknown principal, which
  // holds no role (wire contracts section 4).
  async removeProjectMember(
    actor: PrincipalId,
    target: { readonly projectId: string; readonly principalId: string },
    invocation: AdministrativeInvocation,
  ): Promise<Result<void>> {
    const scope = { projectIdText: target.projectId, check: existingProject };
    const removed = await this.#roleCommand(actor, scope, invocation, (tx) => principalWithId(tx, target.principalId), removal);
    return removed.ok || isUnknownPrincipal(removed.error) ? ok(undefined) : removed;
  }

  #authorized(actor: PrincipalId): Promise<Result<void>> {
    return this.#deps.store.transaction((tx) => authorizeIn(tx, actor, OWNER_ONLY));
  }

  async #assign(
    actor: PrincipalId,
    target: { readonly projectId: string; readonly role: string },
    principalOf: (tx: AccessTransaction) => Promise<Result<Principal>>,
    invocation: AdministrativeInvocation,
  ): Promise<Result<ProjectRoleAssignment>> {
    const role = parseProjectRole(target.role);
    if (!role.ok) return role;
    const scope = { projectIdText: target.projectId, check: existingProject };
    const assignment = await this.#roleCommand(actor, scope, invocation, principalOf, async (tx, principalId, projectId, at) => {
      const assigned = await tx.projectRoles.assign(projectId, principalId, role.value, at);
      if (!assigned.ok) return assigned;
      return ok({ changed: true, event: { kind: 'access.project-role-assigned', principalId, projectId, role: role.value } });
    });
    return assignment.ok ? ok({ ...assignment.value, role: role.value }) : assignment;
  }

  #roleCommand(
    actor: PrincipalId,
    scope: RoleScope,
    invocation: AdministrativeInvocation,
    principalOf: (tx: AccessTransaction) => Promise<Result<Principal>>,
    change: RoleChange,
  ): Promise<Result<ProjectRoleChange>> {
    const projectId = parseIdentifier('ProjectId', scope.projectIdText);
    if (!projectId.ok) return Promise.resolve(projectId);
    return this.#command(actor, invocation, async (tx, at) => {
      const project = await scope.check(tx, projectId.value);
      if (!project.ok) return project;
      const principal = await principalOf(tx);
      if (!principal.ok) return principal;
      const { principalId, loginName } = principal.value;
      const changed = await change(tx, principalId, projectId.value, at);
      if (!changed.ok) return changed;
      const recorded = changed.value.changed ? await tx.changes.record(rolesChanged(principalId, projectId.value)) : ok(undefined);
      if (!recorded.ok) return recorded;
      const { role } = changed.value;
      const value = { principalId, loginName, projectId: projectId.value, ...(role === undefined ? {} : { role }) };
      return ok({ value, ...(changed.value.changed ? { event: changed.value.event } : {}) });
    });
  }

  // Checks the invocation and the actor's role before any other port.
  #command<Value>(
    actor: PrincipalId,
    invocation: AdministrativeInvocation,
    work: (tx: AccessTransaction, at: Instant) => Promise<Result<{ value: Value; event?: Audited }>>,
  ): Promise<Result<Value>> {
    const checked = checkInvocation(invocation);
    if (!checked.ok) return Promise.resolve(checked);
    return this.#deps.store.transaction(async (tx) => {
      const authorized = await authorizeIn(tx, actor, OWNER_ONLY);
      if (!authorized.ok) return authorized;
      const at = this.#deps.clock.now();
      const done = await work(tx, at);
      if (!done.ok) return done;
      if (done.value.event !== undefined) {
        const appended = await tx.audit.append({ ...done.value.event, actor: invocation.actor, reason: invocation.reason, occurredAt: at });
        if (!appended.ok) return appended;
      }
      return ok(done.value.value);
    });
  }
}

// Which project identifiers a role command accepts.
interface RoleScope {
  readonly projectIdText: string;
  readonly check: (tx: AccessTransaction, projectId: string) => Promise<Result<void>>;
}

async function existingProject(tx: AccessTransaction, projectId: string): Promise<Result<void>> {
  const project = await tx.projects.get(projectId);
  if (!project.ok) return project;
  return project.value === undefined ? unknownProject() : ok(undefined);
}

// Roles assigned before projects existed name no project (design 7).
async function anyProject(): Promise<Result<void>> {
  return ok(undefined);
}

type RoleChange = (
  tx: AccessTransaction, principalId: PrincipalId, projectId: string, at: Instant,
) => Promise<Result<{ changed: boolean; role?: ProjectRole; event: Audited }>>;

const removal: RoleChange = async (tx, principalId, projectId) => {
  const held = await tx.projectRoles.roleOf(projectId, principalId);
  if (!held.ok) return held;
  const removed = await tx.projectRoles.remove(projectId, principalId);
  if (!removed.ok) return removed;
  const event: Audited = { kind: 'access.project-role-removed', principalId, projectId, ...(held.value === undefined ? {} : { role: held.value }) };
  return ok({ changed: removed.value, event });
};

function isUnknownPrincipal(failed: Failure): boolean {
  return failed.code === 'not-found' && failed.details.principal !== undefined;
}

async function principalWithId(tx: AccessTransaction, text: string): Promise<Result<Principal>> {
  const principalId = parsePrincipalId(text);
  const found = principalId.ok ? await tx.principals.get(principalId.value) : ok(undefined);
  if (!found.ok) return found;
  if (found.value !== undefined) return ok(found.value);
  return err(failure('not-found', 'no principal has this identifier', { principal: text }));
}

async function principalNamed(tx: AccessTransaction, loginName: Principal['loginName']): Promise<Result<Principal>> {
  const found = await tx.principals.findByLoginName(loginName);
  if (!found.ok) return found;
  if (found.value !== undefined) return ok(found.value);
  return err(failure('not-found', `no principal has the login name ${loginName}`, { loginName }));
}
