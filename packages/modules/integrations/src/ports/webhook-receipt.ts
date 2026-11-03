import type { Result } from '@taskelith/kernel';
import type { ScmIntegrationId } from '../domain/scm-integration.js';
import type { WebhookDelivery, WebhookEvent, WebhookVerifier } from './source-control.js';

export type { ScmIntegrationId };

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

// The verified deliveries that a service sends without an event of the
// port, such as a ping, by their headers.
export interface EventlessDeliveries {
  isEventless(delivery: WebhookDelivery): boolean;
}
