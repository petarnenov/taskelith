import { err, ok, type Result } from '@taskelith/kernel';
import { integrationMoved, nextBinding, type BindingPut, type RepositoryBinding, type RepositoryBindings } from '../ports/repository-bindings.js';
import type { ScmIntegrations } from '../ports/scm-integrations.js';

// The store in memory, for tests and tools: each put checks and writes with
// no await between, so a compare-and-set never interleaves with another.
export class InMemoryRepositoryBindings implements RepositoryBindings {
  readonly #integrations: Pick<ScmIntegrations, 'get'>;
  readonly #stored = new Map<string, RepositoryBinding>();

  constructor(integrations: Pick<ScmIntegrations, 'get'>) {
    this.#integrations = integrations;
  }

  async get(projectId: string): Promise<Result<RepositoryBinding | undefined>> {
    return ok(this.#stored.get(projectId));
  }

  async put(put: BindingPut): Promise<Result<RepositoryBinding>> {
    const integration = await this.#integrations.get(put.values.integrationId);
    if (!integration.ok) return integration;
    if (integration.value?.revision !== put.integrationRevision) return err(integrationMoved());
    const next = nextBinding(this.#stored.get(put.projectId), put);
    if (next.ok) this.#stored.set(put.projectId, next.value);
    return next;
  }
}
