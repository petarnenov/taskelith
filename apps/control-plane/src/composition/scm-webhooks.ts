import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ScmIntegrationId, ScmIntegrationVerifiers, WebhookDelivery, WebhookEvent, WebhookVerifier } from '@taskelith/integrations';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// The verifier of each integration the control plane serves, held in
// memory; empty until SCM integrations are stored.
export class InMemoryScmIntegrationVerifiers implements ScmIntegrationVerifiers {
  readonly #verifiers: ReadonlyMap<string, WebhookVerifier>;

  constructor(verifiers: ReadonlyMap<string, WebhookVerifier> = new Map()) {
    this.#verifiers = verifiers;
  }

  async verifierOf(integrationId: ScmIntegrationId): Promise<Result<WebhookVerifier | undefined>> {
    return ok(this.#verifiers.get(integrationId));
  }
}

// The work of a signature check, HMAC-SHA256 over the raw body and a
// constant-time comparison, under a random key; then a refusal.
export class DecoyWebhookVerifier implements WebhookVerifier {
  readonly #key = randomBytes(32);

  async verifyWebhookDelivery({ rawBody }: WebhookDelivery): Promise<Result<WebhookEvent>> {
    const digest = createHmac('sha256', this.#key).update(rawBody).digest();
    timingSafeEqual(digest, Buffer.alloc(digest.length));
    return err(failure('forbidden', 'the integration is unknown'));
  }
}
