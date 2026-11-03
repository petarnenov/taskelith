import { err, failure, ok, type Result } from '@taskelith/kernel';
import { codeUnitOrder, type ScmIntegration, type ScmIntegrationId, type ScmSecrets } from '../domain/scm-integration.js';
import { changedConfiguration, type ScmIntegrationChange, type ScmIntegrations, type StoredScmConfiguration } from '../ports/scm-integrations.js';

// The store in memory, for tests and tools; each call is atomic, so a
// compare-and-set never interleaves with another.
export class InMemoryScmIntegrations implements ScmIntegrations {
  readonly #stored = new Map<ScmIntegrationId, StoredScmConfiguration>();

  async add(integration: ScmIntegration, secrets: ScmSecrets): Promise<Result<ScmIntegration>> {
    if (this.#stored.has(integration.integrationId)) return err(failure('conflict', 'the integration identifier is taken'));
    return ok(this.#keep({ integration, secrets }));
  }

  async get(integrationId: ScmIntegrationId): Promise<Result<ScmIntegration | undefined>> {
    return ok(this.#stored.get(integrationId)?.integration);
  }

  async page(after: string | undefined, limit: number): Promise<Result<readonly ScmIntegration[]>> {
    const ids = [...this.#stored.keys()].filter((id) => after === undefined || codeUnitOrder(id, after) > 0).sort(codeUnitOrder);
    return ok(ids.slice(0, limit).map((id) => this.#stored.get(id)!.integration));
  }

  async update(integrationId: ScmIntegrationId, change: ScmIntegrationChange): Promise<Result<ScmIntegration>> {
    const stored = this.#stored.get(integrationId);
    if (stored === undefined) return err(failure('not-found', 'no SCM integration has this identifier'));
    if (stored.integration.revision !== change.expectedRevision) return err(failure('conflict', 'the integration changed since its revision'));
    return ok(this.#keep(changedConfiguration(stored, change)));
  }

  async configurationOf(integrationId: ScmIntegrationId): Promise<Result<StoredScmConfiguration | undefined>> {
    return ok(this.#stored.get(integrationId));
  }

  #keep(stored: StoredScmConfiguration): ScmIntegration {
    const integration = Object.freeze({ ...stored.integration, settings: Object.freeze({ ...stored.integration.settings }) });
    this.#stored.set(integration.integrationId, { integration, secrets: stored.secrets });
    return integration;
  }
}
