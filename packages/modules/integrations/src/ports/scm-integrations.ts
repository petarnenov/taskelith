import type { Result } from '@taskelith/kernel';
import type { NormalizedOrigin } from '../domain/normalized-origin.js';
import type { ScmIntegration, ScmIntegrationId, ScmSecrets } from '../domain/scm-integration.js';
import type { SourceControlPlugin } from './source-control-plugin.js';

// A change by compare-and-set on `expectedRevision`: settings replace every
// setting, and secrets replace the named ones and keep the others.
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

// The integrations with their secrets, which only `configurationOf` opens.
// Pages are in code-unit order of the identifier, after `after`.
export interface ScmIntegrations {
  add(integration: ScmIntegration, secrets: ScmSecrets): Promise<Result<ScmIntegration>>;
  get(integrationId: ScmIntegrationId): Promise<Result<ScmIntegration | undefined>>;
  page(after: string | undefined, limit: number): Promise<Result<readonly ScmIntegration[]>>;
  // `not-found` for an unknown integration; `conflict` when the revision
  // moved, so of two concurrent changes exactly one wins.
  update(integrationId: ScmIntegrationId, change: ScmIntegrationChange): Promise<Result<ScmIntegration>>;
  configurationOf(integrationId: ScmIntegrationId): Promise<Result<StoredScmConfiguration | undefined>>;
}

// The SCM plugins the composition registered, by manifest identifier.
export interface ScmPlugins {
  pluginOf(pluginId: string): SourceControlPlugin | undefined;
}

export interface ScmIntegrationIds {
  next(): ScmIntegrationId;
}
