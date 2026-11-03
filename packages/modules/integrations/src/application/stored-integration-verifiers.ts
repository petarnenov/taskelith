import { ok, type Result } from '@taskelith/kernel';
import type { ScmIntegrationId } from '../domain/scm-integration.js';
import type { ScmIntegrations, ScmPlugins } from '../ports/scm-integrations.js';
import type { WebhookVerifier } from '../ports/source-control.js';
import type { ScmIntegrationVerifiers } from '../ports/webhook-receipt.js';

interface CachedVerifier {
  readonly revision: number;
  readonly verifier: WebhookVerifier;
}

// The verifier of each stored integration, built by its plugin and cached by
// revision, so that a changed webhook secret applies to the next delivery.
export class StoredScmIntegrationVerifiers implements ScmIntegrationVerifiers {
  readonly #store: Pick<ScmIntegrations, 'get' | 'configurationOf'>;
  readonly #plugins: ScmPlugins;
  readonly #cache = new Map<ScmIntegrationId, CachedVerifier>();

  constructor(store: Pick<ScmIntegrations, 'get' | 'configurationOf'>, plugins: ScmPlugins) {
    this.#store = store;
    this.#plugins = plugins;
  }

  // None, so the decoy and the one 401, also for an integration whose plugin
  // is gone or cannot be built: a sender cannot tell it from an unknown one.
  async verifierOf(integrationId: ScmIntegrationId): Promise<Result<WebhookVerifier | undefined>> {
    const current = await this.#store.get(integrationId);
    if (!current.ok || current.value === undefined) return current.ok ? ok(undefined) : current;
    const cached = this.#cache.get(integrationId);
    if (cached?.revision === current.value.revision) return ok(cached.verifier);
    return this.#built(integrationId);
  }

  async #built(integrationId: ScmIntegrationId): Promise<Result<WebhookVerifier | undefined>> {
    const stored = await this.#store.configurationOf(integrationId);
    if (!stored.ok || stored.value === undefined) return stored.ok ? ok(undefined) : stored;
    const { integration, secrets } = stored.value;
    const provider = this.#plugins.pluginOf(integration.pluginId)?.createProvider({ settings: integration.settings, secrets: secrets.reveal() });
    if (provider === undefined || !provider.ok) return ok(undefined);
    this.#cache.set(integrationId, { revision: integration.revision, verifier: provider.value });
    return ok(provider.value);
  }
}
