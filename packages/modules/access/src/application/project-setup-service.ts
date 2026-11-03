import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { PrincipalId } from '../domain/principal.js';
import {
  FIRST_REVISION,
  parseMintedProjectId,
  parseProjectDefaults,
  parseProjectName,
  unknownProject,
  type Project,
  type ProjectDefaults,
  type StoredAutoMergeSetting,
  type StoredDefaults,
} from '../domain/project.js';
import { OWNER_ONLY, projectRequirement, type AccessRequirement } from '../domain/requirement.js';
import type { AccessStore, AccessTransaction, ProjectMembership } from '../ports/access-store.js';
import type { RandomValues } from '../ports/random-values.js';
import { authorizeIn } from './authorization-service.js';
import { checkInvocation, type AdministrativeInvocation } from './operator-credential-service.js';

// Every list returns at most this many items (wire contracts section 6).
export const PROJECT_PAGE_SIZE = 100;

export interface ProjectSetupDependencies {
  readonly store: AccessStore;
  readonly random: RandomValues;
  readonly clock: Clock;
}

// `next` names the last item while more remain.
export interface Page<Item> {
  readonly items: readonly Item[];
  readonly next?: string;
}

export interface Revised<Value> {
  readonly expectedRevision: number;
  readonly value: Value;
}

type Audited = Pick<AccessAuditEvent, 'kind' | 'projectId'>;

// Projects with their defaults and auto-merge setting (wire contracts
// section 4). Each command checks the actor's role in its transaction.
export class ProjectSetupService {
  readonly #deps: ProjectSetupDependencies;

  constructor(dependencies: ProjectSetupDependencies) {
    this.#deps = dependencies;
  }

  // The project has no member, its creator included (wire section 3).
  createProject(
    actor: PrincipalId, creation: { readonly name: string; readonly defaults: ProjectDefaults }, invocation: AdministrativeInvocation,
  ): Promise<Result<Project>> {
    const name = parseProjectName(creation.name);
    if (!name.ok) return Promise.resolve(name);
    const defaults = parseProjectDefaults(creation.defaults);
    if (!defaults.ok) return Promise.resolve(defaults);
    return this.#command(actor, OWNER_ONLY, invocation, async (tx, at) => {
      const projectId = parseMintedProjectId(this.#deps.random.projectId());
      if (!projectId.ok) return projectId;
      const project: Project = Object.freeze({ projectId: projectId.value, name: name.value, createdAt: at, revision: FIRST_REVISION });
      const added = await tx.projects.add(project, defaults.value);
      if (!added.ok) return added;
      return ok({ value: project, event: { kind: 'access.project-created', projectId: project.projectId } });
    });
  }

  // Every project to an installation-owner, else those the caller is in.
  listProjects(caller: PrincipalId, after: string | undefined): Promise<Result<Page<Project>>> {
    return this.#deps.store.transaction(async (tx) => {
      const owner = await tx.principals.isInstallationOwner(caller);
      if (!owner.ok) return owner;
      const query = { limit: PROJECT_PAGE_SIZE + 1, ...(after === undefined ? {} : { after }), ...(owner.value ? {} : { memberOf: caller }) };
      const projects = await tx.projects.page(query);
      return projects.ok ? ok(pageOf(projects.value, (project) => project.projectId)) : projects;
    });
  }

  readProject(projectId: string): Promise<Result<Project>> {
    return this.#read((tx) => tx.projects.get(projectId));
  }

  renameProject(actor: PrincipalId, projectId: string, update: Revised<string>, invocation: AdministrativeInvocation): Promise<Result<Project>> {
    const name = parseProjectName(update.value);
    if (!name.ok) return Promise.resolve(name);
    return this.#command(actor, maintainerOf(projectId), invocation, async (tx) => {
      const renamed = await tx.projects.rename(projectId, update.expectedRevision, name.value);
      if (!renamed.ok) return renamed;
      return ok({ value: renamed.value, event: { kind: 'access.project-renamed', projectId } });
    });
  }

  readDefaults(projectId: string): Promise<Result<StoredDefaults>> {
    return this.#read((tx) => tx.projects.defaults(projectId));
  }

  // Applies to tasks created afterwards; no existing run changes.
  replaceDefaults(
    actor: PrincipalId, projectId: string, update: Revised<ProjectDefaults>, invocation: AdministrativeInvocation,
  ): Promise<Result<StoredDefaults>> {
    const defaults = parseProjectDefaults(update.value);
    if (!defaults.ok) return Promise.resolve(defaults);
    return this.#command(actor, maintainerOf(projectId), invocation, async (tx, changedAt) => {
      const change = { changedBy: actor, changedAt };
      const replaced = await tx.projects.replaceDefaults(projectId, update.expectedRevision, defaults.value, change);
      if (!replaced.ok) return replaced;
      return ok({ value: replaced.value, event: { kind: 'access.project-defaults-changed', projectId } });
    });
  }

  readAutoMergeSetting(projectId: string): Promise<Result<StoredAutoMergeSetting>> {
    return this.#read((tx) => tx.projects.autoMergeSetting(projectId));
  }

  listMembers(projectId: string, after: string | undefined): Promise<Result<Page<ProjectMembership>>> {
    return this.#deps.store.transaction(async (tx) => {
      const project = await tx.projects.get(projectId);
      if (!project.ok) return project;
      if (project.value === undefined) return unknownProject();
      const members = await tx.projectRoles.members(projectId, after, PROJECT_PAGE_SIZE + 1);
      return members.ok ? ok(pageOf(members.value, (member) => member.principalId)) : members;
    });
  }

  #read<Value>(read: (tx: AccessTransaction) => Promise<Result<Value | undefined>>): Promise<Result<Value>> {
    return this.#deps.store.transaction(async (tx) => {
      const found = await read(tx);
      if (!found.ok) return found;
      return found.value === undefined ? unknownProject() : ok(found.value);
    });
  }

  #command<Value>(
    actor: PrincipalId,
    requirement: AccessRequirement,
    invocation: AdministrativeInvocation,
    work: (tx: AccessTransaction, at: Instant) => Promise<Result<{ value: Value; event: Audited }>>,
  ): Promise<Result<Value>> {
    const checked = checkInvocation(invocation);
    if (!checked.ok) return Promise.resolve(checked);
    return this.#deps.store.transaction(async (tx) => {
      const authorized = await authorizeIn(tx, actor, requirement);
      if (!authorized.ok) return authorized;
      const at = this.#deps.clock.now();
      const done = await work(tx, at);
      if (!done.ok) return done;
      const event = { ...done.value.event, actor: invocation.actor, reason: invocation.reason, occurredAt: at };
      const appended = await tx.audit.append(event);
      return appended.ok ? ok(done.value.value) : appended;
    });
  }
}

function maintainerOf(projectId: string): AccessRequirement {
  return projectRequirement(projectId, 'project-maintainer');
}

// The store read one item beyond the page, which tells whether more remain.
function pageOf<Item>(items: readonly Item[], keyOf: (item: Item) => string): Page<Item> {
  if (items.length <= PROJECT_PAGE_SIZE) return { items };
  const page = items.slice(0, PROJECT_PAGE_SIZE);
  return { items: page, next: keyOf(page.at(-1)!) };
}
