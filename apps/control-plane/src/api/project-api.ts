import type {
  AdministrativeInvocation,
  Page,
  PrincipalAdministration,
  PrincipalId,
  Project,
  ProjectDefaults,
  ProjectMembership,
  ProjectSetupService,
  SettingChange,
  StoredAutoMergeSetting,
  StoredDefaults,
} from '@taskelith/access';
import type { HttpSchemas } from '@taskelith/contracts';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { ApiRequest } from './api-server.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

// What the project operations reach (wire contracts section 4).
export interface ProjectOperations {
  readonly setup: Pick<
    ProjectSetupService,
    'createProject' | 'listProjects' | 'readProject' | 'renameProject' | 'readDefaults' | 'replaceDefaults' | 'readAutoMergeSetting' | 'listMembers'
  >;
  readonly members: Pick<PrincipalAdministration, 'assignProjectMember' | 'removeProjectMember'>;
}

// The handlers of section 4 for projects, members, and defaults. The server
// checked the role on the path's project, or the owner's, before the body.
export class ProjectApi {
  readonly #operations: ProjectOperations;

  constructor(operations: ProjectOperations) {
    this.#operations = operations;
  }

  async listProjects(request: ApiRequest): Promise<Result<Wire<'ProjectPage'>>> {
    const caller = callerOf(request);
    if (!caller.ok) return caller;
    const after = afterOf(request);
    if (!after.ok) return after;
    const page = await this.#operations.setup.listProjects(caller.value, after.value);
    return page.ok ? ok({ projects: page.value.items.map(projectBody), ...nextOf(page.value) }) : page;
  }

  async createProject(request: ApiRequest): Promise<Result<Wire<'Project'>>> {
    const caller = callerOf(request);
    if (!caller.ok) return caller;
    const { name, defaults } = request.body as Wire<'ProjectCreation'>;
    const created = await this.#operations.setup.createProject(caller.value, { name, defaults: defaultsOf(defaults) }, invocationOf(caller.value, 'createProject'));
    return created.ok ? ok(projectBody(created.value)) : created;
  }

  async readProject({ parameters }: ApiRequest): Promise<Result<Wire<'Project'>>> {
    const read = await this.#operations.setup.readProject(parameters[0] ?? '');
    return read.ok ? ok(projectBody(read.value)) : read;
  }

  async updateProject(request: ApiRequest): Promise<Result<Wire<'Project'>>> {
    const caller = callerOf(request);
    if (!caller.ok) return caller;
    const { expectedRevision, name } = request.body as Wire<'ProjectUpdate'>;
    const update = { expectedRevision, value: name };
    const renamed = await this.#operations.setup.renameProject(caller.value, request.parameters[0] ?? '', update, invocationOf(caller.value, 'updateProject'));
    return renamed.ok ? ok(projectBody(renamed.value)) : renamed;
  }

  async listProjectMembers(request: ApiRequest): Promise<Result<Wire<'ProjectMemberPage'>>> {
    const after = afterOf(request);
    if (!after.ok) return after;
    const page = await this.#operations.setup.listMembers(request.parameters[0] ?? '', after.value);
    return page.ok ? ok({ members: page.value.items.map(memberBody), ...nextOf(page.value) }) : page;
  }

  async assignProjectMember(request: ApiRequest): Promise<Result<Wire<'ProjectMember'>>> {
    const caller = callerOf(request);
    if (!caller.ok) return caller;
    const [projectId = '', principalId = ''] = request.parameters;
    const { role } = request.body as Wire<'MemberAssignment'>;
    const target = { projectId, principalId, role };
    const assigned = await this.#operations.members.assignProjectMember(caller.value, target, invocationOf(caller.value, 'assignProjectMember'));
    if (!assigned.ok) return assigned;
    const { loginName } = assigned.value;
    return ok({ principal: { principalId: assigned.value.principalId, loginName }, role: assigned.value.role ?? role });
  }

  async removeProjectMember(request: ApiRequest): Promise<Result<void>> {
    const caller = callerOf(request);
    if (!caller.ok) return caller;
    const [projectId = '', principalId = ''] = request.parameters;
    return this.#operations.members.removeProjectMember(caller.value, { projectId, principalId }, invocationOf(caller.value, 'removeProjectMember'));
  }

  async readProjectDefaults({ parameters }: ApiRequest): Promise<Result<Wire<'ProjectDefaults'>>> {
    const read = await this.#operations.setup.readDefaults(parameters[0] ?? '');
    return read.ok ? ok(storedDefaultsBody(read.value)) : read;
  }

  async updateProjectDefaults(request: ApiRequest): Promise<Result<Wire<'ProjectDefaults'>>> {
    const caller = callerOf(request);
    if (!caller.ok) return caller;
    const { expectedRevision, defaults } = request.body as Wire<'ProjectDefaultsUpdate'>;
    const update = { expectedRevision, value: defaultsOf(defaults) };
    const projectId = request.parameters[0] ?? '';
    const replaced = await this.#operations.setup.replaceDefaults(caller.value, projectId, update, invocationOf(caller.value, 'updateProjectDefaults'));
    return replaced.ok ? ok(storedDefaultsBody(replaced.value)) : replaced;
  }

  async readAutoMergeSetting({ parameters }: ApiRequest): Promise<Result<Wire<'AutoMergeSetting'>>> {
    const read = await this.#operations.setup.readAutoMergeSetting(parameters[0] ?? '');
    return read.ok ? ok(autoMergeBody(read.value)) : read;
  }
}

function callerOf(request: ApiRequest): Result<PrincipalId> {
  if (request.principalId !== undefined) return ok(request.principalId);
  return err(failure('internal', 'a project operation reached its handler without a principal'));
}

// The caller is the audited actor; the operation is the reason.
function invocationOf(actor: PrincipalId, operationId: string): AdministrativeInvocation {
  return { actor, reason: `control-plane API ${operationId}` };
}

function afterOf({ query }: ApiRequest): Result<string | undefined> {
  const after = query.get('after');
  if (after === null) return ok(undefined);
  const parsed = parseIdentifier('Identifier', after);
  return parsed.ok ? ok(parsed.value) : err(failure('invalid', 'after must be an identifier', { field: 'after' }));
}

function nextOf(page: Page<unknown>): { next?: string } {
  return page.next === undefined ? {} : { next: page.next };
}

function projectBody(project: Project): Wire<'Project'> {
  return { projectId: project.projectId, name: project.name, createdAt: project.createdAt, revision: project.revision };
}

function memberBody(member: ProjectMembership): Wire<'ProjectMember'> {
  return { principal: { principalId: member.principalId, loginName: member.loginName }, role: member.role };
}

function defaultsOf(input: Wire<'ProjectDefaultsInput'>): ProjectDefaults {
  return {
    frameworkPluginId: input.framework.pluginId, implementers: input.implementers, reviewer: input.reviewer,
    specApprover: input.specApprover, noEligibleSlot: input.noEligibleSlot,
  };
}

function storedDefaultsBody({ defaults, revision, lastChange }: StoredDefaults): Wire<'ProjectDefaults'> {
  return {
    framework: { pluginId: defaults.frameworkPluginId }, implementers: [...defaults.implementers], reviewer: defaults.reviewer,
    specApprover: defaults.specApprover, noEligibleSlot: defaults.noEligibleSlot, revision, ...changeBody(lastChange),
  };
}

function autoMergeBody({ enabled, revision, lastChange }: StoredAutoMergeSetting): Wire<'AutoMergeSetting'> {
  return { enabled, revision, ...changeBody(lastChange) };
}

function changeBody(change: SettingChange | undefined): { changedBy?: string; changedAt?: string } {
  return change === undefined ? {} : { changedBy: change.changedBy, changedAt: change.changedAt };
}
