import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  EventlessDeliveries,
  ScmIntegrationId,
  ScmIntegrationVerifiers,
  WebhookDelivery,
  WebhookEvent,
  WebhookVerifier,
} from '@taskelith/integrations';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// The GitHub plugin's signature header and form (core design decision 5).
const GITHUB_SIGNATURE_HEADER = 'x-hub-signature-256';
const GITHUB_SIGNATURE = /^sha256=([0-9a-fA-F]{64})$/;
const GITHUB_EVENT_HEADER = 'x-github-event';

// GitHub's events without a repository, which the port's event cannot
// carry (core design decision 5); they answer 202 and are not recorded.
export const GITHUB_EVENTLESS_EVENTS: ReadonlySet<string> = new Set(['ping', 'installation', 'installation_repositories']);

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

export class GithubEventlessDeliveries implements EventlessDeliveries {
  isEventless(delivery: WebhookDelivery): boolean {
    return GITHUB_EVENTLESS_EVENTS.has(delivery.headers[GITHUB_EVENT_HEADER] ?? '');
  }
}

// The GitHub plugin's check under a random key, then a refusal: HMAC and
// comparison only for a well-formed signature, as the plugin does.
export class GithubWebhookDecoy implements WebhookVerifier {
  readonly #key = randomBytes(32);

  async verifyWebhookDelivery({ headers, rawBody }: WebhookDelivery): Promise<Result<WebhookEvent>> {
    const presented = GITHUB_SIGNATURE.exec(headers[GITHUB_SIGNATURE_HEADER] ?? '');
    if (presented !== null) {
      const received = Buffer.from(presented[1]!, 'hex');
      const expected = createHmac('sha256', this.#key).update(rawBody).digest();
      if (received.length === expected.length) timingSafeEqual(received, expected);
    }
    return err(failure('forbidden', 'the integration is unknown'));
  }
}
