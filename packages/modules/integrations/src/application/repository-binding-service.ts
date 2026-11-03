import { err, failure, ok, parseIdentifier, type Failure, type Result } from '@taskelith/kernel';
import { normalizeOrigin } from '../domain/normalized-origin.js';
import type { ScmIntegration, ScmIntegrationId } from '../domain/scm-integration.js';
import type { BindableProjects, RepositoryBinding, RepositoryBindings } from '../ports/repository-bindings.js';
import type { ScmIntegrations, ScmPlugins } from '../ports/scm-integrations.js';
import type { MergeMethod, RepositoryRemote, SourceControlProvider } from '../ports/source-control.js';
import { readCapabilities, readRepositoryRemote } from '../ports/source-control-readers.js';
import { readResult, type Reading } from '../ports/untrusted-shapes.js';

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
    const remote = await resolvedRemote(provider, binding.repository);
    if (!remote.ok) return remote;
    if (!sameOrigin(remote.value.remoteUrl, integration)) return err(refusal('remote-origin-mismatch', 'the remote URL lies outside the allowed origin'));
    const methods = declaredMergeMethods(provider);
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
    const built = await pluginAnswer(() => plugin.createProvider({ settings: integration.settings, secrets: secrets.reveal() }), asProvider);
    if (!built.ok) return built;
    if (!built.value.ok) return err(failure('unavailable', 'the SCM plugin cannot serve the integration'));
    return ok({ integration, provider: built.value.value });
  }
}

// Calls the plugin and reads its envelope and value once, inside one
// boundary; a throw or a broken shape is the plugin defect, never quoted.
async function pluginAnswer<Value>(
  call: () => Result<unknown> | Promise<Result<unknown>>, read: (value: unknown) => Reading<Value>,
): Promise<Result<Result<Value>>> {
  try {
    const envelope = readResult(await call());
    if (!envelope.ok) return err(pluginDefect());
    if (!envelope.value.ok) return ok(err(envelope.value.error));
    const value = read(envelope.value.value);
    return value.ok ? ok(ok(value.value)) : err(pluginDefect());
  } catch {
    return err(pluginDefect());
  }
}

// A provider is an object whose operations are called in their own boundary.
function asProvider(value: unknown): Reading<SourceControlProvider> {
  const isObject = typeof value === 'object' && value !== null;
  return isObject ? ok(value as SourceControlProvider) : err(['provider must be an object']);
}

// The plugin's message may quote a secret, so only its code is kept.
async function resolvedRemote(provider: SourceControlProvider, repository: string): Promise<Result<RepositoryRemote>> {
  const resolved = await pluginAnswer(() => provider.resolveRemoteUrl({ repository }), readRepositoryRemote);
  if (!resolved.ok) return resolved;
  if (!resolved.value.ok) return err(resolverFailure(resolved.value.error));
  const remote = resolved.value.value;
  return remote.repository === repository ? ok(remote) : err(pluginDefect());
}

function resolverFailure({ code }: Failure): Failure {
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
      return pluginDefect();
  }
}

function declaredMergeMethods(provider: SourceControlProvider): Result<readonly string[]> {
  try {
    const read = readCapabilities(provider.capabilities);
    return read.ok ? ok(read.value.mergeMethods) : err(pluginDefect());
  } catch {
    return err(pluginDefect());
  }
}

// A resolved remote URL has the `RemoteUrl` form, so its origin parses.
function sameOrigin(remoteUrl: string, integration: ScmIntegration): boolean {
  const origin = normalizeOrigin(new URL(remoteUrl).origin, 'remoteUrl');
  return origin.ok && origin.value === integration.allowedOrigin;
}

function refusal(reason: string, message: string): Failure {
  return failure('precondition-failed', message, { reason });
}

function pluginDefect(): Failure {
  return failure('internal', 'the SCM plugin answered outside its contract');
}
