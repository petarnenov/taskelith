import { randomBytes } from 'node:crypto';
import { ScmIntegrationSecretKeyFile, type ControlPlaneNamespace } from '@taskelith/control-plane-store';
import {
  ScmIntegrationService,
  ScmWebhookReceiver,
  type BindableProjects,
  type RepositoryBindingService,
  StoredScmIntegrationVerifiers,
  type ScmIntegrationId,
  type ScmIntegrations,
  type ScmPlugins,
  type ScmWebhookDeliveries,
  type SourceControlPlugin,
  type UnverifiableIntegrations,
} from '@taskelith/integrations';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';
import { CommittingScmWebhookDeliveries, PostgresRepositoryBindings, PostgresScmIntegrations, type PostgresDatabase } from '@taskelith/postgres';
import { registerGithubSourceControlPlugin } from '@taskelith/scm-github';
import { scmSecretCipher } from '@taskelith/secrets';
import { repositoryBindingService } from './repository-bindings.js';
import { singlePlugin } from './scm-plugins.js';

// The ports the composition offers SCM plugins.
export const SCM_PLUGIN_HOST = Object.freeze({ ports: Object.freeze(['SourceControlProvider']) });

export interface ScmIntegrationServices {
  readonly integrations: ScmIntegrationService;
  readonly webhooks: ScmWebhookReceiver;
}

export interface StartedScmIntegrationServices extends ScmIntegrationServices {
  readonly bindings: RepositoryBindingService;
}

// The integrations over PostgreSQL with GitHub, the first SCM (ADR 0006); a
// missing or malformed secret key refuses the start.
export function startScmIntegrationServices(
  namespace: ControlPlaneNamespace, database: PostgresDatabase, logger: Logger, projects: BindableProjects,
): Result<StartedScmIntegrationServices> {
  const key = new ScmIntegrationSecretKeyFile(namespace).read();
  if (!key.ok) return key;
  const cipher = scmSecretCipher(key.value);
  if (!cipher.ok) return cipher;
  const github = registerGithubSourceControlPlugin(SCM_PLUGIN_HOST);
  if (!github.ok) return github;
  const integrations = new PostgresScmIntegrations(database, cipher.value);
  const plugins = singlePlugin(github.value);
  const bindings = repositoryBindingService({ bindings: new PostgresRepositoryBindings(database), integrations, plugins, projects });
  const deliveries = new CommittingScmWebhookDeliveries(database);
  return ok({ ...scmIntegrationServices({ store: integrations, deliveries, plugin: github.value, plugins }, logger), bindings });
}

export interface ScmIntegrationPorts {
  readonly store: ScmIntegrations;
  readonly deliveries: ScmWebhookDeliveries;
  readonly plugin: SourceControlPlugin;
  readonly plugins: ScmPlugins;
}

// The installation's SCM plugin also gives the receiver its decoy and its
// eventless rule, so no plugin fact is copied here.
export function scmIntegrationServices(
  { store, deliveries, plugin, plugins }: ScmIntegrationPorts, logger: Logger,
): ScmIntegrationServices {
  const verifiers = new StoredScmIntegrationVerifiers(store, plugins, unverifiableLog(logger));
  return {
    integrations: new ScmIntegrationService({ store, plugins, ids: { next: mintIntegrationId } }),
    webhooks: new ScmWebhookReceiver({ verifiers, deliveries, decoy: plugin.createDecoy(), eventless: plugin }),
  };
}

function unverifiableLog(logger: Logger): UnverifiableIntegrations {
  return {
    unverifiable: (integrationId, revision, reason) => logger.warn('scm.integration.unverifiable', { integrationId, revision, reason }),
  };
}

// `i` and 32 lowercase hexadecimal digits from 128 random bits (wire
// contracts section 6).
export function mintIntegrationId(): ScmIntegrationId {
  const minted = parseIdentifier('ScmIntegrationId', `i${randomBytes(16).toString('hex')}`);
  if (!minted.ok) throw new RangeError(minted.error.message);
  return minted.value;
}
