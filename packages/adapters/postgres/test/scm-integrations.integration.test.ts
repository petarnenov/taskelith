import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import { SCM_INTEGRATIONS_CONFORMANCE, ScmSecrets, normalizeOrigin, type ScmIntegration, type ScmIntegrationId } from '@taskelith/integrations';
import { parseIdentifier } from '@taskelith/kernel';
import { PostgresDatabase, PostgresScmIntegrations, type TransactionWork } from '@taskelith/postgres';
import { scmSecretCipher } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';
import { rendezvous } from './gated-transactions.ts';
import { createMigratedDatabase, query } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

const SECRET = 'synthetic-webhook-secret';
const cipher = value(scmSecretCipher(randomBytes(32)));
const store = new PostgresScmIntegrations(database, cipher);
const secrets = (values: Record<string, string>) => value(ScmSecrets.of(values));
let minted = 0;

function integration(): ScmIntegration {
  minted += 1;
  return {
    integrationId: value(parseIdentifier('ScmIntegrationId', `i${String(minted).padStart(32, '0')}`)) as ScmIntegrationId,
    pluginId: 'scm-example', label: 'Example', allowedOrigin: value(normalizeOrigin('https://git.example.com')),
    settings: { 'account-id': '42' }, secretNames: ['signing-key', 'webhook-secret'], revision: 1,
  };
}

for (const conformance of SCM_INTEGRATIONS_CONFORMANCE) {
  test(`PostgreSQL SCM integrations: ${conformance.name}`, async () => {
    await query(url, 'TRUNCATE scm_integration_secrets, scm_integrations');
    assert.deepEqual(await conformance.check(store), []);
  });
}

async function added(): Promise<ScmIntegration> {
  return value(await store.add(integration(), secrets({ 'webhook-secret': SECRET, 'signing-key': SECRET })));
}

test('an added integration reads back with its secret names, and its secrets are sealed at rest', async () => {
  const stored = await added();
  assert.deepEqual(value(await store.get(stored.integrationId)), stored);
  assert.deepEqual(stored.secretNames, ['signing-key', 'webhook-secret']);
  const rows = await query<{ sealed: Buffer }>(url, 'SELECT sealed FROM scm_integration_secrets WHERE integration_id = $1', [stored.integrationId]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => !row.sealed.includes(SECRET)));
  const opened = value(await store.configurationOf(stored.integrationId));
  assert.deepEqual(opened?.secrets.reveal(), { 'signing-key': SECRET, 'webhook-secret': SECRET });
});

test('an update replaces the named secrets, re-seals the others under the new revision, and fails at a stale one', async () => {
  const stored = await added();
  const change = { expectedRevision: 1, label: 'Renamed', settings: { 'account-id': '43' }, secrets: secrets({ 'webhook-secret': 'rotated' }) };
  const updated = value(await store.update(stored.integrationId, change));
  assert.deepEqual([updated.label, updated.settings, updated.revision, updated.secretNames], ['Renamed', { 'account-id': '43' }, 2, stored.secretNames]);
  assert.deepEqual(value(await store.configurationOf(stored.integrationId))?.secrets.reveal(), { 'signing-key': SECRET, 'webhook-secret': 'rotated' });
  assert.equal(failed(await store.update(stored.integrationId, { expectedRevision: 1, label: 'Stale' })).code, 'conflict');
  assert.equal(failed(await store.update(integration().integrationId, { expectedRevision: 1, label: 'Missing' })).code, 'not-found');
});

test('a sealed secret put back from an earlier revision no longer opens', async () => {
  const stored = await added();
  const [before] = await query<{ nonce: Buffer; sealed: Buffer }>(url,
    "SELECT nonce, sealed FROM scm_integration_secrets WHERE integration_id = $1 AND name = 'signing-key'", [stored.integrationId]);
  value(await store.update(stored.integrationId, { expectedRevision: 1, label: 'Moved' }));
  await query(url, "UPDATE scm_integration_secrets SET nonce = $2, sealed = $3 WHERE integration_id = $1 AND name = 'signing-key'",
    [stored.integrationId, before!.nonce, before!.sealed]);
  const refused = failed(await store.configurationOf(stored.integrationId));
  assert.deepEqual([refused.code, refused.details], ['internal', { setting: 'signing-key' }]);
});

// Both transactions read the revision before either writes, so the second
// write meets the first's row and is retried, which then sees a conflict.
test('of two concurrent updates at one revision exactly one wins and the other fails with conflict', async () => {
  const stored = await added();
  const arrive = rendezvous(2);
  let attempts = 0;
  const overlapping = {
    transaction: <Value>(work: TransactionWork<Value>) => database.transaction(async (tx) => {
      attempts += 1;
      await tx.scmIntegrations.get(stored.integrationId);
      if (attempts <= 2) await arrive();
      return work(tx);
    }),
  };
  const racing = new PostgresScmIntegrations(overlapping, cipher);
  const outcomes = await Promise.all(['First', 'Second'].map((label) => racing.update(stored.integrationId, { expectedRevision: 1, label })));
  assert.deepEqual(outcomes.map((outcome) => (outcome.ok ? 'won' : outcome.error.code)).sort(), ['conflict', 'won']);
  assert.equal(value(await store.get(stored.integrationId))?.revision, 2);
  assert.ok(attempts >= 3, 'the losing transaction was retried');
});
