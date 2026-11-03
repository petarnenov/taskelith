import type { Result } from '@taskelith/kernel';
import type { SourceControlProvider, WebhookDelivery, WebhookVerifier } from './source-control.js';

// An integration's settings or secrets by their kebab-case names.
export type ScmValues = Readonly<Record<string, string>>;

// What a plugin needs to serve one integration: every setting and secret.
export interface SourceControlConfiguration {
  readonly settings: ScmValues;
  readonly secrets: ScmValues;
}

// The draft plugin descriptor of an SCM plugin. Its checks fail with
// `invalid` and `details.setting` naming the setting, never its value.
export interface SourceControlPlugin {
  // The plugin's manifest identifier, which integrations name.
  readonly id: string;
  // Every secret an integration must hold.
  readonly secretNames: readonly string[];
  // The whole set: an unknown, missing, or invalid setting fails.
  checkSettings(settings: ScmValues): Result<void>;
  // One secret: an unknown name or an invalid value fails.
  checkSecret(name: string, secret: string): Result<void>;
  createProvider(configuration: SourceControlConfiguration): Result<SourceControlProvider>;
  // Does the work of the plugin's verification under a random key and
  // refuses every delivery, for an unknown integration.
  createDecoy(): WebhookVerifier;
  // A verified delivery that the service sends without a port event.
  isEventless(delivery: WebhookDelivery): boolean;
}
