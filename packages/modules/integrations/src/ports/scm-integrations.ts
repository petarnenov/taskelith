import type { Result } from '@taskelith/kernel';
import type { NormalizedOrigin } from '../domain/normalized-origin.js';
import type { ScmIntegration, ScmIntegrationId, ScmSecrets } from '../domain/scm-integration.js';
import type { ScmIntegrationAuditEntry } from './scm-integration-audit.js';
import type { SourceControlPlugin } from './source-control-plugin.js';

// A change by compare-and-set on `expectedRevision`: settings replace every
// setting, secrets replace the named ones, and an undefined field keeps.
export interface ScmIntegrationChange {
  readonly expectedRevision: number;
  readonly label?: string;
  readonly allowedOrigin?: NormalizedOrigin;
  readonly settings?: Readonly<Record<string, string>>;
  readonly secrets?: ScmSecrets;
}

export interface StoredScmConfiguration {
  readonly integration: ScmIntegration;
  readonly secrets: ScmSecrets;
}

// The one meaning of a change for every store: `current` at the revision
// the change expects, with at least the secrets that the change keeps.
export function changedConfiguration(current: StoredScmConfiguration, change: ScmIntegrationChange): StoredScmConfiguration {
  const { integration } = current;
  const secrets = change.secrets === undefined ? current.secrets : current.secrets.replacedBy(change.secrets);
  return {
    integration: {
      ...integration,
      label: change.label ?? integration.label,
      allowedOrigin: change.allowedOrigin ?? integration.allowedOrigin,
      settings: change.settings ?? integration.settings,
      secretNames: secrets.names(),
      revision: integration.revision + 1,
    },
    secrets,
  };
}

// The integrations with their secrets, which only `configurationOf` opens.
// Each write appends its audit row in its own transaction.
export interface ScmIntegrations {
  add(integration: ScmIntegration, secrets: ScmSecrets, audit: ScmIntegrationAuditEntry): Promise<Result<ScmIntegration>>;
  get(integrationId: ScmIntegrationId): Promise<Result<ScmIntegration | undefined>>;
  // Pages are in code-unit order of the identifier, after `after`.
  page(after: string | undefined, limit: number): Promise<Result<readonly ScmIntegration[]>>;
  // `not-found` for an unknown integration; `conflict` when the revision
  // moved, so of two concurrent changes exactly one wins.
  update(integrationId: ScmIntegrationId, change: ScmIntegrationChange, audit: ScmIntegrationAuditEntry): Promise<Result<ScmIntegration>>;
  configurationOf(integrationId: ScmIntegrationId): Promise<Result<StoredScmConfiguration | undefined>>;
}

// The SCM plugins the composition registered, by manifest identifier read
// at registration, so that a lookup never runs plugin code.
export interface ScmPlugins {
  pluginOf(pluginId: string): SourceControlPlugin | undefined;
}

export interface ScmIntegrationIds {
  next(): ScmIntegrationId;
}

export type UnverifiableReason = 'plugin-missing' | 'provider-refused';

// Tells the operator that a stored integration cannot verify its webhooks,
// which a sender only sees as the one 401.
export interface UnverifiableIntegrations {
  unverifiable(integrationId: ScmIntegrationId, revision: number, reason: UnverifiableReason): void;
}

// `descriptor`: reading the plugin's identifier or secret names.
export type ScmPluginOperation =
  | 'descriptor' | 'checkSettings' | 'checkSecret' | 'createProvider' | 'resolveRemoteUrl' | 'capabilities';

// The defect's plugin when the plugin's own identifier cannot be read.
export const UNREADABLE_PLUGIN_ID = '(unreadable)';

export type ScmPluginDefectKind =
  | 'threw' | 'malformed-envelope' | 'malformed-value' | 'foreign-repository' | 'unnormalizable-origin' | 'unexpected-failure-code';

// A plugin answer outside the source control contract, by its kind only.
export interface ScmPluginDefect {
  readonly integrationId: ScmIntegrationId;
  readonly pluginId: string;
  readonly operation: ScmPluginOperation;
  readonly kind: ScmPluginDefectKind;
}

// Never given the plugin's message, stack, or a value it returned.
export interface ScmPluginDefects {
  defect(defect: ScmPluginDefect): void;
}
