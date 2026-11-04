import { err, failure, ok, parseIdentifier, type Failure, type Result } from '@taskelith/kernel';
import { normalizeRemoteOrigin } from '../domain/normalized-origin.js';
import type { ScmIntegration, ScmIntegrationId } from '../domain/scm-integration.js';
import type { BindableProjects, RepositoryBinding, RepositoryBindings } from '../ports/repository-bindings.js';
import type {
  ScmIntegrations, ScmPluginDefectKind, ScmPluginDefects, ScmPluginOperation, ScmPlugins,
} from '../ports/scm-integrations.js';
import type { MergeMethod, RepositoryRemote, SourceControlProvider } from '../ports/source-control.js';
import { readCapabilities, readRepositoryRemote } from '../ports/source-control-readers.js';
import { readUntrustedResult, type Reading } from '../ports/untrusted-shapes.js';

// The binding a maintainer sends: no remote URL, which the plugin resolves.
export interface RepositoryBindingRequest {
  readonly integrationId: string;
  readonly repository: string;
  readonly integrationBranch: string;
  readonly mergeMethod: MergeMethod;
}

export interface RepositoryBindingUpdate {
  readonly expectedRevision?: number;
  readonly binding: RepositoryBindingRequest;
}

export interface RepositoryBindingServicePorts {
  readonly bindings: RepositoryBindings;
  readonly integrations: Pick<ScmIntegrations, 'configurationOf'>;
  readonly plugins: ScmPlugins;
  readonly projects: BindableProjects;
  readonly defects: ScmPluginDefects;
}

interface Resolution {
  readonly integration: ScmIntegration;
  readonly remoteUrl: string;
}

// Wire contracts sections 4 and 4.1: the plugin resolves the remote URL
// outside the store's transaction, which then checks that nothing moved.
export class RepositoryBindingService {
  readonly #ports: RepositoryBindingServicePorts;

  constructor(ports: RepositoryBindingServicePorts) {
    this.#ports = ports;
  }

  // The binding as stored, with no re-check.
  async read(projectId: string): Promise<Result<RepositoryBinding>> {
    const known = await this.#knownProject(projectId);
    if (!known.ok) return known;
    const read = await this.#ports.bindings.get(projectId);
    if (!read.ok) return read;
    return read.value === undefined ? err(failure('not-found', 'the project is not bound')) : ok(read.value);
  }

  async bind(projectId: string, update: RepositoryBindingUpdate): Promise<Result<RepositoryBinding>> {
    const known = await this.#knownProject(projectId);
    if (!known.ok) return known;
    const { binding, expectedRevision } = update;
    const resolved = await this.#resolve(binding);
    if (!resolved.ok) return resolved;
    const { integration, remoteUrl } = resolved.value;
    const values = { ...binding, integrationId: integration.integrationId, remoteUrl };
    return this.#ports.bindings.put({
      projectId, values, integrationRevision: integration.revision, ...(expectedRevision === undefined ? {} : { expectedRevision }),
    });
  }

  async #knownProject(projectId: string): Promise<Result<void>> {
    const exists = await this.#ports.projects.exists(projectId);
    if (!exists.ok) return exists;
    return exists.value ? ok(undefined) : err(failure('not-found', 'no project has this identifier'));
  }

  // The checks in the order of `BindingRefusal`.
  async #resolve(binding: RepositoryBindingRequest): Promise<Result<Resolution>> {
    const stored = await this.#configurationOf(binding.integrationId);
    if (!stored.ok) return stored;
    const { integration, provider } = stored.value;
    const defect = this.#reportingDefect(integration);
    const remote = await resolvedRemote(provider, binding.repository, (kind) => defect('resolveRemoteUrl', kind));
    if (!remote.ok) return remote;
    const origin = normalizeRemoteOrigin(remote.value.remoteUrl);
    if (!origin.ok) return err(defect('resolveRemoteUrl', 'unnormalizable-origin'));
    if (origin.value !== integration.allowedOrigin) return err(refusal('remote-origin-mismatch', 'the remote URL lies outside the allowed origin'));
    const methods = declaredMergeMethods(provider, (kind) => defect('capabilities', kind));
    if (!methods.ok) return methods;
    if (!methods.value.includes(binding.mergeMethod)) return err(refusal('merge-method-undeclared', 'the plugin does not declare the merge method'));
    return ok({ integration, remoteUrl: remote.value.remoteUrl });
  }

  async #configurationOf(integrationIdText: string): Promise<Result<{ integration: ScmIntegration; provider: SourceControlProvider }>> {
    const integrationId = parseIdentifier('ScmIntegrationId', integrationIdText);
    const stored = integrationId.ok ? await this.#ports.integrations.configurationOf(integrationId.value as ScmIntegrationId) : ok(undefined);
    if (!stored.ok) return stored;
    if (stored.value === undefined) return err(failure('not-found', 'no SCM integration has this identifier'));
    const { integration, secrets } = stored.value;
    const plugin = this.#ports.plugins.pluginOf(integration.pluginId);
    if (plugin === undefined) return err(failure('unavailable', 'the integration names no registered SCM plugin'));
    const create = () => plugin.createProvider({ settings: integration.settings, secrets: secrets.reveal() });
    const built = await pluginAnswer(create, asProvider, (kind) => this.#reportingDefect(integration)('createProvider', kind));
    if (!built.ok) return built;
    if (!built.value.ok) return err(unusableConfiguration());
    return ok({ integration, provider: built.value.value });
  }

  // Reports the defect of one plugin call and returns its sanitized answer.
  #reportingDefect({ integrationId, pluginId }: ScmIntegration): ReportedDefect {
    return (operation, kind) => {
      this.#ports.defects.defect({ integrationId, pluginId, operation, kind });
      return pluginDefect();
    };
  }
}

type ReportedDefect = (operation: ScmPluginOperation, kind: ScmPluginDefectKind) => Failure;
type DefectOfCall = (kind: ScmPluginDefectKind) => Failure;

// Calls the plugin and reads its envelope and value once, inside one
// boundary; a throw or a broken shape is the plugin defect, never quoted.
async function pluginAnswer<Value>(
  call: () => Result<unknown> | Promise<Result<unknown>>, read: (value: unknown) => Reading<Value>, defect: DefectOfCall,
): Promise<Result<Result<Value>>> {
  try {
    const envelope = readUntrustedResult(await call());
    if (!envelope.ok) return err(defect('malformed-envelope'));
    if (!envelope.value.ok) return ok(err(envelope.value.error));
    const value = read(envelope.value.value);
    return value.ok ? ok(ok(value.value)) : err(defect('malformed-value'));
  } catch {
    return err(defect('threw'));
  }
}

// A provider is an object whose operations are called in their own boundary.
function asProvider(value: unknown): Reading<SourceControlProvider> {
  const isObject = typeof value === 'object' && value !== null;
  return isObject ? ok(value as SourceControlProvider) : err(['provider must be an object']);
}

// The plugin's message may quote a secret, so only its code is kept.
async function resolvedRemote(provider: SourceControlProvider, repository: string, defect: DefectOfCall): Promise<Result<RepositoryRemote>> {
  const resolved = await pluginAnswer(() => provider.resolveRemoteUrl({ repository }), readRepositoryRemote, defect);
  if (!resolved.ok) return resolved;
  if (!resolved.value.ok) return err(resolverFailure(resolved.value.error, defect));
  const remote = resolved.value.value;
  return remote.repository === repository ? ok(remote) : err(defect('foreign-repository'));
}

function resolverFailure({ code }: Failure, defect: DefectOfCall): Failure {
  switch (code) {
    case 'not-found':
      return refusal('repository-not-visible', 'the integration cannot see the repository');
    case 'forbidden':
      return refusal('integration-credential-refused', 'the SCM service refused the integration credential');
    case 'unavailable':
      return failure('unavailable', 'the SCM service is unavailable');
    case 'invalid':
      return failure('invalid', 'the SCM plugin refused the repository identifier', { field: 'repository' });
    default:
      return defect('unexpected-failure-code');
  }
}

function declaredMergeMethods(provider: SourceControlProvider, defect: DefectOfCall): Result<readonly string[]> {
  try {
    const read = readCapabilities(provider.capabilities);
    return read.ok ? ok(read.value.mergeMethods) : err(defect('malformed-value'));
  } catch {
    return err(defect('threw'));
  }
}

function refusal(reason: string, message: string): Failure {
  return failure('precondition-failed', message, { reason });
}

// The plugin refused the stored configuration; its message is never quoted.
function unusableConfiguration(): Failure {
  const reason = 'integration-configuration-unusable';
  return failure('unavailable', "the integration's stored configuration is unusable", { reason });
}

function pluginDefect(): Failure {
  return failure('internal', 'the SCM plugin answered outside its contract');
}
