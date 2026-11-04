import { err, failure, ok, parseIdentifier, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import type { ScmPluginDefects } from '../ports/scm-integrations.js';
import { readWebhookEvent } from '../ports/source-control-readers.js';
import type { WebhookDelivery, WebhookVerifier } from '../ports/source-control.js';
import type { Reading } from '../ports/untrusted-shapes.js';
import type {
  DeliveryRecording,
  EventlessDeliveries,
  ScmIntegrationId,
  ScmIntegrationVerifiers,
  ScmWebhookDeliveries,
} from '../ports/webhook-receipt.js';
import { pluginAnswer, pluginDefect, pluginMember, type ReportedDefect } from './plugin-answer.js';

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
  // The installation's SCM plugin, whose defects are reported by kind.
  readonly pluginId: string;
  readonly defects: ScmPluginDefects;
}

// A receipt, or the failure of a plugin defect that is already reported.
type Verified = Result<Result<WebhookReceipt>>;

// Source control contract section 6: verify a delivery on its raw bytes,
// then parse it, and record its event once per delivery identifier.
export class ScmWebhookReceiver {
  readonly #ports: ScmWebhookReceiverPorts;

  constructor(ports: ScmWebhookReceiverPorts) {
    this.#ports = ports;
  }

  // A plugin defect gets the decoy's work and the one 401 of an unknown
  // integration, so a sender cannot tell them apart.
  async receive(integrationIdText: string, delivery: WebhookDelivery): Promise<Result<WebhookReceipt>> {
    const integrationId = parseIdentifier('ScmIntegrationId', integrationIdText);
    const verifier = integrationId.ok ? await this.#ports.verifiers.verifierOf(integrationId.value) : ok(undefined);
    if (!verifier.ok) return verifier;
    if (!integrationId.ok || verifier.value === undefined) return this.#decoyed(delivery);
    const verified = await this.#verified(integrationId.value, verifier.value, delivery);
    return verified.ok ? verified.value : this.#decoyed(delivery);
  }

  async #verified(integrationId: ScmIntegrationId, verifier: WebhookVerifier, delivery: WebhookDelivery): Promise<Verified> {
    const defect = this.#reportingDefect(integrationId);
    const verify = () => verifier.verifyWebhookDelivery(delivery);
    const verified = await pluginAnswer(verify, readWebhookEvent, (kind) => defect('verifyWebhookDelivery', kind));
    if (!verified.ok) return verified;
    if (verified.value.ok) return ok(await this.#ports.deliveries.record(integrationId, verified.value.value));
    const refusal = verified.value.error;
    if (refusal.code === 'forbidden') return ok(err(signatureInvalid()));
    if (refusal.code === 'invalid') return this.#unmapped(delivery, defect);
    return ok(err(verificationRefusal(refusal.code)));
  }

  // A verified delivery the plugin maps to no event is accepted only when
  // it is eventless and its payload a JSON object.
  #unmapped(delivery: WebhookDelivery, defect: ReportedDefect): Verified {
    const isEventless = () => this.#ports.eventless.isEventless(delivery);
    const eventless = pluginMember(isEventless, asFlag, (kind) => defect('isEventless', kind));
    if (!eventless.ok) return eventless;
    if (eventless.value && isJsonObject(delivery.rawBody)) return ok(ok('no-event'));
    return ok(err(failure('invalid', 'the verified delivery carries no event that can be recorded')));
  }

  // Whatever the decoy answers, the delivery gets the one 401.
  async #decoyed(delivery: WebhookDelivery): Promise<Result<WebhookReceipt>> {
    const defect = this.#reportingDefect(undefined);
    const verify = () => this.#ports.decoy.verifyWebhookDelivery(delivery);
    await pluginAnswer(verify, readWebhookEvent, (kind) => defect('verifyWebhookDelivery', kind));
    return err(signatureInvalid());
  }

  #reportingDefect(integrationId: ScmIntegrationId | undefined): ReportedDefect {
    return (operation, kind) => {
      this.#ports.defects.defect({ integrationId, pluginId: this.#ports.pluginId, operation, kind });
      return pluginDefect();
    };
  }
}

// Wire contracts section 5: one answer for an unknown integration and a
// missing or failed signature, which does not say which.
function signatureInvalid(): Failure {
  return failure('forbidden', 'the delivery has no valid signature', { reason: 'signature-invalid' });
}

// The messages of the other refusal codes of a verification.
const VERIFICATION_REFUSALS: Readonly<Record<Exclude<FailureCode, 'forbidden' | 'invalid'>, string>> = {
  'not-found': 'the SCM plugin found nothing to verify the delivery against',
  conflict: 'the SCM plugin could not verify the delivery because of a conflict',
  'precondition-failed': 'the SCM plugin cannot verify the delivery in its current state',
  unavailable: 'the SCM service is unavailable to verify the delivery',
  internal: 'the SCM plugin failed to verify the delivery',
};

// The plugin's message and details may quote a secret, so only its code is
// kept, with a fixed message.
function verificationRefusal(code: keyof typeof VERIFICATION_REFUSALS): Failure {
  return failure(code, VERIFICATION_REFUSALS[code]);
}

function asFlag(value: unknown): Reading<boolean> {
  return typeof value === 'boolean' ? ok(value) : err(['must be a boolean']);
}

function isJsonObject(rawBody: Uint8Array): boolean {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
