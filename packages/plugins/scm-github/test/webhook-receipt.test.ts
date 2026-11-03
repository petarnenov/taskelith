import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScmWebhookReceiver,
  type EventlessDeliveries,
  type ScmWebhookDeliveries,
  type WebhookEvent,
  type WebhookVerifier,
} from '@taskelith/integrations';
import { err, failure, ok } from '@taskelith/kernel';
import { githubTestbed, PROJECT, signedBody, signedDelivery, WEBHOOK_SECRET } from './github-fixture.ts';

// The module's receiver over this plugin and the emulated GitHub.
const INTEGRATION = `i${'c'.repeat(32)}`;
const decoy: WebhookVerifier = { verifyWebhookDelivery: async () => err(failure('forbidden', 'unknown')) };
// A double of the composition's rule for GitHub's eventless deliveries.
const EVENTLESS: EventlessDeliveries = {
  isEventless: (delivery) => ['ping', 'installation_repositories'].includes(delivery.headers['x-github-event'] ?? ''),
};

interface Receipt {
  readonly receiver: ScmWebhookReceiver;
  readonly recorded: WebhookEvent[];
}

// A fresh plugin, receiver, and record for each test.
function receipt(): Receipt {
  const { provider } = githubTestbed();
  const recorded: WebhookEvent[] = [];
  const deliveries: ScmWebhookDeliveries = {
    record: async (_integrationId, event) => {
      if (recorded.some((known) => known.deliveryId === event.deliveryId)) return ok('repeated');
      recorded.push(event);
      return ok('recorded');
    },
  };
  const receiver = new ScmWebhookReceiver({
    verifiers: { verifierOf: async (integrationId) => ok(integrationId === INTEGRATION ? provider : undefined) },
    deliveries,
    decoy,
    eventless: EVENTLESS,
  });
  return { receiver, recorded };
}

test('a GitHub delivery is recorded once across redeliveries', async () => {
  const { receiver, recorded } = receipt();
  const delivery = signedDelivery({ kind: 'change-request', repository: PROJECT, changeRequest: '7' }, WEBHOOK_SECRET, 'guid-1');
  assert.deepEqual(await receiver.receive(INTEGRATION, delivery), ok('recorded'));
  assert.deepEqual(await receiver.receive(INTEGRATION, delivery), ok('repeated'));
  assert.equal(recorded.length, 1);
});

test('a GitHub ping and installation event carry no event and are not recorded', async () => {
  const { receiver, recorded } = receipt();
  const ping = signedBody(Buffer.from('{"zen":"Design for failure.","hook_id":1}'), WEBHOOK_SECRET, 'guid-2', 'ping');
  const installation = signedBody(Buffer.from('{"action":"added","installation":{"id":5678}}'), WEBHOOK_SECRET, 'guid-3', 'installation_repositories');
  assert.deepEqual(await receiver.receive(INTEGRATION, ping), ok('no-event'));
  assert.deepEqual(await receiver.receive(INTEGRATION, installation), ok('no-event'));
  assert.deepEqual(recorded, []);
});

test('a GitHub delivery under another secret is refused like an unknown integration', async () => {
  const { receiver } = receipt();
  const event = { kind: 'change-request', repository: PROJECT, changeRequest: '8' } as const;
  const refused = await receiver.receive(INTEGRATION, signedDelivery(event, 'another-secret', 'guid-4'));
  const unknown = await receiver.receive(`i${'d'.repeat(32)}`, signedDelivery(event, WEBHOOK_SECRET, 'guid-4'));
  assert.deepEqual(refused, unknown);
  assert.equal(!refused.ok && refused.error.details.reason, 'signature-invalid');
});
