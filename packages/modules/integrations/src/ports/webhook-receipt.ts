import type { Identifier, Result } from '@taskelith/kernel';
import type { WebhookEvent, WebhookVerifier } from './source-control.js';

// An SCM integration, whose plugin verifies the deliveries sent to it.
export type ScmIntegrationId = Identifier<'ScmIntegrationId'>;

// The verifier of each SCM integration that the composition serves, or
// undefined for an integration it does not know.
export interface ScmIntegrationVerifiers {
  verifierOf(integrationId: ScmIntegrationId): Promise<Result<WebhookVerifier | undefined>>;
}

// `recorded` for a new delivery; `repeated` for a delivery identifier that
// the integration already recorded, which changes nothing.
export type DeliveryRecording = 'recorded' | 'repeated';

// Verified events, at most one per integration and delivery identifier,
// also under concurrent redeliveries.
export interface ScmWebhookDeliveries {
  record(integrationId: ScmIntegrationId, event: WebhookEvent): Promise<Result<DeliveryRecording>>;
}
