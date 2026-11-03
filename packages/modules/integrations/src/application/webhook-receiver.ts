import { err, failure, ok, parseIdentifier, type Failure, type Result } from '@taskelith/kernel';
import { readWebhookEvent } from '../ports/source-control-readers.js';
import type { WebhookDelivery, WebhookEvent, WebhookVerifier } from '../ports/source-control.js';
import type {
  DeliveryRecording,
  EventlessDeliveries,
  ScmIntegrationId,
  ScmIntegrationVerifiers,
  ScmWebhookDeliveries,
} from '../ports/webhook-receipt.js';

// `no-event`: a verified eventless delivery, such as a service's ping,
// which is accepted and not recorded.
export type WebhookReceipt = DeliveryRecording | 'no-event';

export interface ScmWebhookReceiverPorts {
  readonly verifiers: ScmIntegrationVerifiers;
  readonly deliveries: ScmWebhookDeliveries;
  // Verifies, and refuses, every delivery of an unknown integration, so
  // that its answer takes the work of a known one's.
  readonly decoy: WebhookVerifier;
  readonly eventless: EventlessDeliveries;
}

// Source control contract section 6: verify a delivery on its raw bytes,
// then parse it, and record its event once per delivery identifier.
export class ScmWebhookReceiver {
  readonly #ports: ScmWebhookReceiverPorts;

  constructor(ports: ScmWebhookReceiverPorts) {
    this.#ports = ports;
  }

  async receive(integrationIdText: string, delivery: WebhookDelivery): Promise<Result<WebhookReceipt>> {
    const integrationId = parseIdentifier('ScmIntegrationId', integrationIdText);
    const verifier = integrationId.ok ? await this.#ports.verifiers.verifierOf(integrationId.value) : ok(undefined);
    if (!verifier.ok) return verifier;
    const verified = await (verifier.value ?? this.#ports.decoy).verifyWebhookDelivery(delivery);
    if (!integrationId.ok || verifier.value === undefined) return err(signatureInvalid());
    if (verified.ok) return this.#record(integrationId.value, verified.value);
    if (verified.error.code === 'forbidden') return err(signatureInvalid());
    if (verified.error.code === 'invalid') return this.#unmapped(delivery);
    return verified;
  }

  // A verified delivery the plugin maps to no event is accepted only when
  // it is eventless and its payload a JSON object.
  #unmapped(delivery: WebhookDelivery): Result<WebhookReceipt> {
    if (this.#ports.eventless.isEventless(delivery) && isJsonObject(delivery.rawBody)) return ok('no-event');
    return err(failure('invalid', 'the verified delivery carries no event that can be recorded'));
  }

  async #record(integrationId: ScmIntegrationId, event: WebhookEvent): Promise<Result<WebhookReceipt>> {
    const checked = readWebhookEvent(event);
    if (!checked.ok) return err(failure('internal', `the plugin returned an invalid event: ${checked.error.join('; ')}`));
    return this.#ports.deliveries.record(integrationId, checked.value);
  }
}

// Wire contracts section 5: one answer for an unknown integration and a
// missing or failed signature, which does not say which.
function signatureInvalid(): Failure {
  return failure('forbidden', 'the delivery has no valid signature', { reason: 'signature-invalid' });
}

function isJsonObject(rawBody: Uint8Array): boolean {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
