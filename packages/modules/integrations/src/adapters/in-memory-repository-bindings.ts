import { err, ok, type Result } from '@taskelith/kernel';
import { integrationMoved, nextBinding, type BindingPut, type RepositoryBinding, type RepositoryBindings } from '../ports/repository-bindings.js';
import type { InMemoryScmIntegrations } from './in-memory-scm-integrations.js';

// The store in memory, for tests and tools: a put reads the integration and
// writes inside the integrations' `exclusive`, so no update interleaves.
export class InMemoryRepositoryBindings implements RepositoryBindings {
  readonly #integrations: Pick<InMemoryScmIntegrations, 'get' | 'exclusive'>;
  readonly #stored = new Map<string, RepositoryBinding>();

  constructor(integrations: Pick<InMemoryScmIntegrations, 'get' | 'exclusive'>) {
    this.#integrations = integrations;
  }

  async get(projectId: string): Promise<Result<RepositoryBinding | undefined>> {
    return ok(this.#stored.get(projectId));
  }

  put(put: BindingPut): Promise<Result<RepositoryBinding>> {
    return this.#integrations.exclusive(async () => {
      const integration = await this.#integrations.get(put.values.integrationId);
      if (!integration.ok) return integration;
      if (integration.value?.revision !== put.integrationRevision) return err(integrationMoved());
      const next = nextBinding(this.#stored.get(put.projectId), put);
      if (next.ok) this.#stored.set(put.projectId, next.value);
      return next;
    });
  }
}
