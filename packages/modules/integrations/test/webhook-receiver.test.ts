import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScmWebhookReceiver,
  type DeliveryRecording,
  type EventlessDeliveries,
  type ScmIntegrationVerifiers,
  type ScmWebhookDeliveries,
  type WebhookDelivery,
  type WebhookEvent,
  type WebhookVerifier,
} from '@taskelith/integrations';
import { err, failure, ok, type Result } from '@taskelith/kernel';

const KNOWN = `i${'a'.repeat(32)}`;
const EVENT: WebhookEvent = { deliveryId: 'd-1', kind: 'change-request', repository: 'owner/repository', changeRequest: '7' };
const BODY = new TextEncoder().encode('{"repository":{}}');
const DELIVERY: WebhookDelivery = { headers: { signature: 'valid', event: 'ping' }, rawBody: BODY };
const PUSH: WebhookDelivery = { ...DELIVERY, headers: { signature: 'valid', event: 'push' } };
const REJECTION = { code: 'forbidden', message: 'the delivery has no valid signature', details: { reason: 'signature-invalid' } };

// A verifier that answers what a test sets and remembers what it saw.
class ScriptedVerifier implements WebhookVerifier {
  readonly seen: WebhookDelivery[] = [];
  readonly #answer: () => Result<WebhookEvent>;

  constructor(answer: () => Result<WebhookEvent>) {
    this.#answer = answer;
  }

  async verifyWebhookDelivery(delivery: WebhookDelivery): Promise<Result<WebhookEvent>> {
    this.seen.push(delivery);
    return this.#answer();
  }
}

class RecordingDeliveries implements ScmWebhookDeliveries {
  readonly recorded = new Map<string, WebhookEvent>();

  async record(integrationId: string, event: WebhookEvent): Promise<Result<DeliveryRecording>> {
    const key = `${integrationId} ${event.deliveryId}`;
    if (this.recorded.has(key)) return ok('repeated');
    this.recorded.set(key, event);
    return ok('recorded');
  }
}

interface Testbed {
  readonly receiver: ScmWebhookReceiver;
  readonly deliveries: RecordingDeliveries;
  readonly decoy: ScriptedVerifier;
  readonly asked: string[];
}

// The service sends its pings without an event of the port.
const PINGS_EVENTLESS: EventlessDeliveries = { isEventless: (delivery) => delivery.headers['event'] === 'ping' };

function testbed(answer: () => Result<WebhookEvent>, lookup?: () => Result<WebhookVerifier | undefined>): Testbed {
  const verifier = new ScriptedVerifier(answer);
  const asked: string[] = [];
  const verifiers: ScmIntegrationVerifiers = {
    verifierOf: async (integrationId) => {
      asked.push(integrationId);
      return lookup?.() ?? ok(integrationId === KNOWN ? verifier : undefined);
    },
  };
  const deliveries = new RecordingDeliveries();
  const decoy = new ScriptedVerifier(() => err(failure('forbidden', 'decoy')));
  const receiver = new ScmWebhookReceiver({ verifiers, deliveries, decoy, eventless: PINGS_EVENTLESS });
  return { receiver, deliveries, decoy, asked };
}

test('a verified delivery is recorded once and a redelivery answers as a repeat', async () => {
  const { receiver, deliveries } = testbed(() => ok(EVENT));
  assert.deepEqual(await receiver.receive(KNOWN, DELIVERY), ok('recorded'));
  assert.deepEqual(await receiver.receive(KNOWN, DELIVERY), ok('repeated'));
  assert.deepEqual([...deliveries.recorded.values()], [EVENT]);
});

test('an unknown, an invalid, and a refused integration get one rejection after the same verification', async () => {
  const { receiver, decoy, asked } = testbed(() => err(failure('forbidden', 'The delivery has no valid signature')));
  const answers = await Promise.all([KNOWN, `i${'b'.repeat(32)}`, 'not an identifier', 'x'.repeat(129)]
    .map((integrationId) => receiver.receive(integrationId, DELIVERY)));
  for (const answer of answers) assert.deepEqual(answer, err(REJECTION));
  assert.equal(decoy.seen.length, 3, 'the decoy verifies every delivery of an unknown integration');
  assert.ok(decoy.seen.every((delivery) => delivery === DELIVERY));
  assert.deepEqual(asked, [KNOWN, `i${'b'.repeat(32)}`], 'an invalid identifier is never looked up');
});

test('a verified payload the plugin cannot parse is invalid and not recorded', async () => {
  const { receiver, deliveries } = testbed(() => err(failure('invalid', 'The delivery body is not an event')));
  const garbled = { ...DELIVERY, rawBody: new Uint8Array([0x7b, 0xff, 0xfe]) };
  for (const rawBody of [garbled.rawBody, new TextEncoder().encode('[1, 2]'), new TextEncoder().encode('"text"')]) {
    const answer = await receiver.receive(KNOWN, { ...DELIVERY, rawBody });
    assert.equal(!answer.ok && answer.error.code, 'invalid');
  }
  assert.equal(deliveries.recorded.size, 0);
});

test('a verified eventless JSON object the plugin maps to no event is accepted without a record', async () => {
  const { receiver, deliveries } = testbed(() => err(failure('invalid', 'The delivery body is not an event')));
  assert.deepEqual(await receiver.receive(KNOWN, DELIVERY), ok('no-event'));
  assert.equal(deliveries.recorded.size, 0);
});

test('a verified delivery the plugin maps to no event is invalid unless eventless with a JSON object', async () => {
  const { receiver, deliveries } = testbed(() => err(failure('invalid', 'The delivery body is not an event')));
  const notEventless = await receiver.receive(KNOWN, PUSH);
  assert.equal(!notEventless.ok && notEventless.error.code, 'invalid');
  const notObject = await receiver.receive(KNOWN, { ...DELIVERY, rawBody: new TextEncoder().encode('[]') });
  assert.equal(!notObject.ok && notObject.error.code, 'invalid');
  assert.equal(deliveries.recorded.size, 0);
});

test('an event the plugin returns in another shape is an internal failure, not a record', async () => {
  const { receiver, deliveries } = testbed(() => ok({ ...EVENT, kind: 'unknown-kind' }));
  const answer = await receiver.receive(KNOWN, DELIVERY);
  assert.equal(!answer.ok && answer.error.code, 'internal');
  assert.equal(deliveries.recorded.size, 0);
});

test('a lookup or verification that is unavailable stays unavailable', async () => {
  const down = testbed(() => ok(EVENT), () => err(failure('unavailable', 'the integrations cannot be read')));
  const lookup = await down.receiver.receive(KNOWN, DELIVERY);
  assert.equal(!lookup.ok && lookup.error.code, 'unavailable');
  const unreachable = testbed(() => err(failure('unavailable', 'the service is down')));
  const verified = await unreachable.receiver.receive(KNOWN, DELIVERY);
  assert.equal(!verified.ok && verified.error.code, 'unavailable');
});
