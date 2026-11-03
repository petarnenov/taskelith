import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { draft } from '@taskelith/plugin-sdk';
import { recordOf, textOf, type JsonRecord } from './github-data.js';

// Deliveries are signed with HMAC-SHA256 over the raw body, checked on the
// bytes as received, before any of the payload is read.

export const SIGNATURE_HEADER = 'x-hub-signature-256';
const DELIVERY_HEADER = 'x-github-delivery';
const EVENT_HEADER = 'x-github-event';
const SIGNATURE = /^sha256=([0-9a-fA-F]{64})$/;
const MAX_IDENTIFIER_LENGTH = 1024;

// GitHub's events without a repository, which the port's event cannot
// carry; the receiver accepts them without recording them.
export const GITHUB_EVENTLESS_EVENTS: ReadonlySet<string> = new Set(['ping', 'installation', 'installation_repositories']);

// GitHub's events and their port kinds; other events are `other`.
const EVENT_KINDS: Readonly<Record<string, string>> = Object.freeze({
  pull_request: 'change-request',
  status: 'commit-status',
  push: 'push',
});

export class GithubWebhookVerifier {
  constructor(private readonly secret: string) {}

  async verifyWebhookDelivery(delivery: draft.WebhookDelivery): Promise<Result<draft.WebhookEvent>> {
    if (!this.isSigned(delivery)) return err(failure('forbidden', 'The delivery has no valid signature'));
    const deliveryId = delivery.headers[DELIVERY_HEADER];
    const event = delivery.headers[EVENT_HEADER];
    if (deliveryId === undefined || deliveryId.length === 0 || deliveryId.length > MAX_IDENTIFIER_LENGTH || event === undefined) {
      return err(failure('invalid', 'The delivery lacks its delivery or event header'));
    }
    const payload = parsePayload(delivery.rawBody);
    const repository = textOf(recordOf(payload?.['repository'])['full_name']);
    if (payload === undefined || repository === undefined) return err(failure('invalid', 'The delivery body is not an event'));
    return ok(eventOf(deliveryId, event, repository, payload));
  }

  private isSigned(delivery: draft.WebhookDelivery): boolean {
    return isSignedWith(this.secret, delivery);
  }
}

export function isGithubEventless(delivery: draft.WebhookDelivery): boolean {
  return GITHUB_EVENTLESS_EVENTS.has(delivery.headers[EVENT_HEADER] ?? '');
}

// The verifier's work under a random key, then a refusal: HMAC and the
// comparison only for a well-formed signature, as the verifier does.
export class GithubWebhookDecoy {
  readonly #key = randomBytes(32);

  async verifyWebhookDelivery(delivery: draft.WebhookDelivery): Promise<Result<draft.WebhookEvent>> {
    isSignedWith(this.#key, delivery);
    return err(failure('forbidden', 'The delivery has no valid signature'));
  }
}

// The digests are compared as bytes, in constant time, once their lengths
// agree; the body is never turned into text for this.
function isSignedWith(secret: string | Buffer, delivery: draft.WebhookDelivery): boolean {
  const presented = SIGNATURE.exec(delivery.headers[SIGNATURE_HEADER] ?? '');
  if (presented === null) return false;
  const received = Buffer.from(presented[1]!, 'hex');
  const expected = createHmac('sha256', secret).update(delivery.rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function parsePayload(rawBody: Uint8Array): JsonRecord | undefined {
  try {
    return recordOf(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)));
  } catch {
    return undefined;
  }
}

// Numbers become strings: change request numbers stay opaque.
function eventOf(deliveryId: string, event: string, repository: string, payload: JsonRecord): draft.WebhookEvent {
  const kind = Object.hasOwn(EVENT_KINDS, event) ? EVENT_KINDS[event]! : 'other';
  const pull = recordOf(payload['pull_request']);
  const number = pull['number'];
  const changeRequest = typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? String(number) : undefined;
  const commit = textOf(recordOf(pull['head'])['sha']) ?? textOf(payload['sha']) ?? textOf(payload['after']);
  return {
    deliveryId,
    kind,
    repository,
    ...(changeRequest === undefined ? {} : { changeRequest }),
    ...(commit === undefined ? {} : { commit }),
  };
}
