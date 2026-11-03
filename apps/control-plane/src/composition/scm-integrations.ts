import { randomBytes } from 'node:crypto';
import { ScmIntegrationSecretKeyFile, type ControlPlaneNamespace } from '@taskelith/control-plane-store';
import {
  ScmIntegrationService,
  ScmWebhookReceiver,
  StoredScmIntegrationVerifiers,
  type ScmIntegrationId,
  type ScmIntegrations,
  type ScmWebhookDeliveries,
  type SourceControlPlugin,
} from '@taskelith/integrations';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { CommittingScmWebhookDeliveries, PostgresScmIntegrations, type PostgresDatabase } from '@taskelith/postgres';
import { registerGithubSourceControlPlugin } from '@taskelith/scm-github';
import { scmSecretCipher } from '@taskelith/secrets';

// The ports the composition offers SCM plugins.
export const SCM_PLUGIN_HOST = Object.freeze({ ports: Object.freeze(['SourceControlProvider']) });

export interface ScmIntegrationServices {
  readonly integrations: ScmIntegrationService;
  readonly webhooks: ScmWebhookReceiver;
}

// The integrations over PostgreSQL with GitHub, the first SCM (ADR 0006); a
// missing or malformed secret key refuses the start.
export function startScmIntegrationServices(namespace: ControlPlaneNamespace, database: PostgresDatabase): Result<ScmIntegrationServices> {
  const key = new ScmIntegrationSecretKeyFile(namespace).read();
  if (!key.ok) return key;
  const cipher = scmSecretCipher(key.value);
  if (!cipher.ok) return cipher;
  const github = registerGithubSourceControlPlugin(SCM_PLUGIN_HOST);
  if (!github.ok) return github;
  return ok(scmIntegrationServices(new PostgresScmIntegrations(database, cipher.value), new CommittingScmWebhookDeliveries(database), github.value));
}

// The installation's SCM plugin also gives the receiver its decoy and its
// eventless rule, so no plugin fact is copied here.
export function scmIntegrationServices(store: ScmIntegrations, deliveries: ScmWebhookDeliveries, plugin: SourceControlPlugin): ScmIntegrationServices {
  const plugins = { pluginOf: (pluginId: string) => (pluginId === plugin.id ? plugin : undefined) };
  return {
    integrations: new ScmIntegrationService({ store, plugins, ids: { next: mintIntegrationId } }),
    webhooks: new ScmWebhookReceiver({
      verifiers: new StoredScmIntegrationVerifiers(store, plugins), deliveries, decoy: plugin.createDecoy(), eventless: plugin,
    }),
  };
}

// `i` and 32 lowercase hexadecimal digits from 128 random bits (wire
// contracts section 6).
export function mintIntegrationId(): ScmIntegrationId {
  const minted = parseIdentifier('ScmIntegrationId', `i${randomBytes(16).toString('hex')}`);
  if (!minted.ok) throw new RangeError(minted.error.message);
  return minted.value;
}
