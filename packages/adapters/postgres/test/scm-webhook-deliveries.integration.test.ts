import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { ScmIntegrationId, WebhookEvent } from '@taskelith/integrations';
import { parseIdentifier } from '@taskelith/kernel';
import { CommittingScmWebhookDeliveries, PostgresDatabase, type TransactionWork } from '@taskelith/postgres';
import { value } from '@taskelith/testing';
import { rendezvous } from './gated-transactions.ts';
import { createMigratedDatabase, query } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

const integration = (text: string) => value(parseIdentifier('ScmIntegrationId', text)) as ScmIntegrationId;
const FIRST = integration(`i${'1'.repeat(32)}`);
const SECOND = integration(`i${'2'.repeat(32)}`);
const EVENT: WebhookEvent = { deliveryId: '18446744073709551615', kind: 'change-request', repository: 'owner/repository', changeRequest: '7' };

interface Row {
  readonly integration_id: string;
  readonly delivery_id: string;
  readonly kind: string;
  readonly repository: string;
  readonly change_request: string | null;
  readonly commit_id: string | null;
}

interface StoredRow extends Omit<Row, 'delivery_id' | 'repository' | 'change_request' | 'commit_id'> {
  readonly delivery_id: Buffer;
  readonly repository: Buffer;
  readonly change_request: Buffer | null;
  readonly commit_id: Buffer | null;
}

// The identifiers are stored as their UTF-16 code units, little-endian.
const text = (stored: Buffer) => stored.toString('utf16le');

const rows = async (): Promise<Row[]> => (await query<StoredRow>(url, `SELECT integration_id, delivery_id, kind, repository,
  change_request, commit_id FROM scm_webhook_deliveries ORDER BY integration_id, delivery_id`)).map((row) => ({
  ...row,
  delivery_id: text(row.delivery_id),
  repository: text(row.repository),
  change_request: row.change_request && text(row.change_request),
  commit_id: row.commit_id && text(row.commit_id),
}));

test('a delivery is recorded once per integration, and a repeat changes nothing', async () => {
  const deliveries = new CommittingScmWebhookDeliveries(database);
  assert.deepEqual(await deliveries.record(FIRST, EVENT), { ok: true, value: 'recorded' });
  assert.deepEqual(await deliveries.record(FIRST, { ...EVENT, kind: 'push' }), { ok: true, value: 'repeated' });
  assert.deepEqual(await deliveries.record(SECOND, { ...EVENT, commit: 'abc123' }), { ok: true, value: 'recorded' });
  assert.deepEqual((await rows()).filter((row) => row.delivery_id === EVENT.deliveryId), [
    { integration_id: FIRST, delivery_id: EVENT.deliveryId, kind: 'change-request', repository: 'owner/repository', change_request: '7', commit_id: null },
    { integration_id: SECOND, delivery_id: EVENT.deliveryId, kind: 'change-request', repository: 'owner/repository', change_request: '7', commit_id: 'abc123' },
  ]);
});

test('identifiers with a NUL or an unpaired surrogate are recorded and read back exactly', async () => {
  const deliveries = new CommittingScmWebhookDeliveries(database);
  const event: WebhookEvent = {
    deliveryId: 'nul\u0000delivery', kind: 'push', repository: 'owner/\u0000repo', changeRequest: '\ud800', commit: 'abc\udc00',
  };
  const integrationId = integration(`i${'3'.repeat(32)}`);
  assert.deepEqual(await deliveries.record(integrationId, event), { ok: true, value: 'recorded' });
  assert.deepEqual(await deliveries.record(integrationId, event), { ok: true, value: 'repeated' });
  const [stored] = (await rows()).filter((row) => row.integration_id === integrationId);
  assert.deepEqual(stored, {
    integration_id: integrationId, delivery_id: event.deliveryId, kind: 'push', repository: event.repository,
    change_request: event.changeRequest, commit_id: event.commit,
  });
});

// Both transactions take their snapshots before either inserts, so the
// second insert conflicts with a row its snapshot cannot see.
test('two concurrent identical deliveries record one event and answer the other as a repeat', async () => {
  const arrive = rendezvous(2);
  let attempts = 0;
  const overlapping = {
    transaction: <Value>(work: TransactionWork<Value>) => database.transaction(async (tx) => {
      attempts += 1;
      await tx.now();
      if (attempts <= 2) await arrive();
      return work(tx);
    }),
  };
  const deliveries = new CommittingScmWebhookDeliveries(overlapping);
  const event = { ...EVENT, deliveryId: 'concurrent-delivery' };
  const outcomes = await Promise.all([deliveries.record(FIRST, event), deliveries.record(FIRST, event)]);
  assert.deepEqual(outcomes.map((outcome) => outcome.ok && outcome.value).sort(), ['recorded', 'repeated']);
  assert.equal(attempts, 3, 'the losing transaction was retried once');
  const recorded = (await rows()).filter((row) => row.delivery_id === 'concurrent-delivery');
  assert.equal(recorded.length, 1);
});
