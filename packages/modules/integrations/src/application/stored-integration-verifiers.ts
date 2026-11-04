import { ok, type Failure, type Result } from '@taskelith/kernel';
import type { ScmIntegration, ScmIntegrationId } from '../domain/scm-integration.js';
import type {
  ScmIntegrations, ScmPluginDefectKind, ScmPluginDefects, ScmPlugins, UnverifiableIntegrations, UnverifiableReason,
} from '../ports/scm-integrations.js';
import type { WebhookVerifier } from '../ports/source-control.js';
import type { ScmIntegrationVerifiers } from '../ports/webhook-receipt.js';
import { asProvider, pluginAnswer, pluginDefect } from './plugin-answer.js';

// None when the revision cannot verify, so that it is reported only once.
interface CachedVerifier {
  readonly revision: number;
  readonly verifier: WebhookVerifier | undefined;
}

// The verifier of each stored integration, built by its plugin and cached by
// revision, so that a changed webhook secret applies to the next delivery.
export class StoredScmIntegrationVerifiers implements ScmIntegrationVerifiers {
  readonly #store: Pick<ScmIntegrations, 'get' | 'configurationOf'>;
  readonly #plugins: ScmPlugins;
  readonly #unverifiable: UnverifiableIntegrations;
  readonly #defects: ScmPluginDefects;
  readonly #cache = new Map<ScmIntegrationId, CachedVerifier>();

  constructor(
    store: Pick<ScmIntegrations, 'get' | 'configurationOf'>, plugins: ScmPlugins,
    unverifiable: UnverifiableIntegrations, defects: ScmPluginDefects,
  ) {
    this.#store = store;
    this.#plugins = plugins;
    this.#unverifiable = unverifiable;
    this.#defects = defects;
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
    const plugin = this.#plugins.pluginOf(integration.pluginId);
    if (plugin === undefined) return ok(this.#unverified(integration, 'plugin-missing'));
    const create = () => plugin.createProvider({ settings: integration.settings, secrets: secrets.reveal() });
    const built = await pluginAnswer(create, asProvider, (kind) => this.#defect(integration, kind));
    if (!built.ok) return ok(this.#kept(integration, undefined));
    if (!built.value.ok) return ok(this.#unverified(integration, 'provider-refused'));
    return ok(this.#kept(integration, built.value.value));
  }

  // The operator learns of a defect once, by its kind, not as unverifiable.
  #defect({ integrationId, pluginId }: ScmIntegration, kind: ScmPluginDefectKind): Failure {
    this.#defects.defect({ integrationId, pluginId, operation: 'createProvider', kind });
    return pluginDefect();
  }

  #unverified(integration: ScmIntegration, reason: UnverifiableReason): undefined {
    this.#unverifiable.unverifiable(integration.integrationId, integration.revision, reason);
    this.#kept(integration, undefined);
    return undefined;
  }

  #kept({ integrationId, revision }: ScmIntegration, verifier: WebhookVerifier | undefined): WebhookVerifier | undefined {
    this.#cache.set(integrationId, { revision, verifier });
    return verifier;
  }
}
