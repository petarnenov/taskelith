import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import {
  SCM_INTEGRATIONS_CONFORMANCE, SCM_INTEGRATION_AUDIT_CONFORMANCE, ScmSecrets, normalizeOrigin, type ScmIntegration, type ScmIntegrationId,
} from '@taskelith/integrations';
import { instantFromEpochMilliseconds, parseIdentifier } from '@taskelith/kernel';
import pg from 'pg';
import { PostgresDatabase, PostgresScmIntegrationAudit, PostgresScmIntegrations, StatementError, type TransactionWork } from '@taskelith/postgres';
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
const audit = new PostgresScmIntegrationAudit(database);
const ENTRY = { actor: `p${'a'.repeat(32)}`, reason: 'postgres scm integrations test', at: value(instantFromEpochMilliseconds(0)) };
const EMPTIED = 'TRUNCATE project_repository_bindings, scm_integration_audit_events, scm_integration_secrets, scm_integrations';
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
    await query(url, EMPTIED);
    assert.deepEqual(await conformance.check(store), []);
  });
}

for (const conformance of SCM_INTEGRATION_AUDIT_CONFORMANCE) {
  test(`PostgreSQL SCM integration audit: ${conformance.name}`, async () => {
    await query(url, EMPTIED);
    assert.deepEqual(await conformance.check({ store, audit }), []);
  });
}

async function added(): Promise<ScmIntegration> {
  return value(await store.add(integration(), secrets({ 'webhook-secret': SECRET, 'signing-key': SECRET }), ENTRY));
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
  const updated = value(await store.update(stored.integrationId, change, ENTRY));
  assert.deepEqual([updated.label, updated.settings, updated.revision, updated.secretNames], ['Renamed', { 'account-id': '43' }, 2, stored.secretNames]);
  assert.deepEqual(value(await store.configurationOf(stored.integrationId))?.secrets.reveal(), { 'signing-key': SECRET, 'webhook-secret': 'rotated' });
  assert.equal(failed(await store.update(stored.integrationId, { expectedRevision: 1, label: 'Stale' }, ENTRY)).code, 'conflict');
  assert.equal(failed(await store.update(integration().integrationId, { expectedRevision: 1, label: 'Missing' }, ENTRY)).code, 'not-found');
});

test('a sealed secret put back from an earlier revision no longer opens', async () => {
  const stored = await added();
  const [before] = await query<{ nonce: Buffer; sealed: Buffer }>(url,
    "SELECT nonce, sealed FROM scm_integration_secrets WHERE integration_id = $1 AND name = 'signing-key'", [stored.integrationId]);
  value(await store.update(stored.integrationId, { expectedRevision: 1, label: 'Moved' }, ENTRY));
  await query(url, "UPDATE scm_integration_secrets SET nonce = $2, sealed = $3 WHERE integration_id = $1 AND name = 'signing-key'",
    [stored.integrationId, before!.nonce, before!.sealed]);
  const refused = failed(await store.configurationOf(stored.integrationId));
  assert.deepEqual([refused.code, refused.details], ['internal', { setting: 'signing-key' }]);
});

test('a secret that no longer opens can be replaced, though an update that keeps it still fails', async () => {
  const stored = await added();
  const [before] = await query<{ nonce: Buffer; sealed: Buffer }>(url,
    "SELECT nonce, sealed FROM scm_integration_secrets WHERE integration_id = $1 AND name = 'signing-key'", [stored.integrationId]);
  value(await store.update(stored.integrationId, { expectedRevision: 1, label: 'Moved' }, ENTRY));
  await query(url, "UPDATE scm_integration_secrets SET nonce = $2, sealed = $3 WHERE integration_id = $1 AND name = 'signing-key'",
    [stored.integrationId, before!.nonce, before!.sealed]);
  const kept = failed(await store.update(stored.integrationId, { expectedRevision: 2, label: 'Kept' }, ENTRY));
  assert.deepEqual([kept.code, kept.details], ['internal', { setting: 'signing-key' }]);
  value(await store.update(stored.integrationId, { expectedRevision: 2, secrets: secrets({ 'signing-key': 'replacement' }) }, ENTRY));
  assert.deepEqual(value(await store.configurationOf(stored.integrationId))?.secrets.reveal(), { 'signing-key': 'replacement', 'webhook-secret': SECRET });
});

test('reads run in read-only transactions and only changes in read-write ones', async () => {
  const used: string[] = [];
  const recording = {
    transaction: <Value>(work: TransactionWork<Value>) => { used.push('read-write'); return database.transaction(work); },
    readOnly: <Value>(work: TransactionWork<Value>) => { used.push('read-only'); return database.readOnly(work); },
  };
  const recorded = new PostgresScmIntegrations(recording, cipher);
  const stored = value(await recorded.add(integration(), secrets({ 'webhook-secret': SECRET }), ENTRY));
  value(await recorded.get(stored.integrationId));
  value(await recorded.page(undefined, 10));
  value(await recorded.configurationOf(stored.integrationId));
  value(await recorded.update(stored.integrationId, { expectedRevision: 1, label: 'Renamed' }, ENTRY));
  assert.deepEqual(used, ['read-write', 'read-only', 'read-only', 'read-only', 'read-write']);
});

// Both transactions read the revision before either writes, so the second
// write meets the first's row and is retried, which then sees a conflict.
test('of two concurrent updates at one revision exactly one wins and the other fails with conflict', async () => {
  const stored = await added();
  const arrive = rendezvous(2);
  let attempts = 0;
  const overlapping = {
    readOnly: <Value>(work: TransactionWork<Value>) => database.readOnly(work),
    transaction: <Value>(work: TransactionWork<Value>) => database.transaction(async (tx) => {
      attempts += 1;
      await tx.scmIntegrations.get(stored.integrationId);
      if (attempts <= 2) await arrive();
      return work(tx);
    }),
  };
  const racing = new PostgresScmIntegrations(overlapping, cipher);
  const outcomes = await Promise.all(['First', 'Second'].map((label) => racing.update(stored.integrationId, { expectedRevision: 1, label }, ENTRY)));
  assert.deepEqual(outcomes.map((outcome) => (outcome.ok ? 'won' : outcome.error.code)).sort(), ['conflict', 'won']);
  assert.equal(value(await store.get(stored.integrationId))?.revision, 2);
  assert.ok(attempts >= 3, 'the losing transaction was retried');
  assert.deepEqual(await auditedOf(stored.integrationId), [['created', 1], ['updated', 2]]);
});

async function auditedOf(integrationId: ScmIntegrationId): Promise<[string, number][]> {
  const rows = await query<{ kind: string; revision: number }>(url,
    'SELECT kind, revision FROM scm_integration_audit_events WHERE integration_id = $1 ORDER BY position', [integrationId]);
  return rows.map((row) => [row.kind, row.revision]);
}

function serializationFailure(): StatementError {
  const lost = new pg.DatabaseError('could not serialize access', 0, 'error');
  lost.code = '40001';
  return new StatementError(lost);
}

// The first attempt loses a serialization race after its audit row is in,
// so only the rollback keeps the retry from leaving a second row.
test('a command retried after its audit row was appended leaves exactly one row', async () => {
  const stored = await added();
  let attempts = 0;
  const losingOnce = {
    readOnly: <Value>(work: TransactionWork<Value>) => database.readOnly(work),
    transaction: <Value>(work: TransactionWork<Value>) => database.transaction(async (tx) => {
      attempts += 1;
      const first = attempts === 1;
      const result = await work(tx);
      if (first) throw serializationFailure();
      return result;
    }),
  };
  const retrying = new PostgresScmIntegrations(losingOnce, cipher);
  value(await retrying.update(stored.integrationId, { expectedRevision: 1, label: 'Retried' }, ENTRY));
  assert.equal(attempts, 2);
  assert.equal(value(await store.get(stored.integrationId))?.revision, 2);
  assert.deepEqual(await auditedOf(stored.integrationId), [['created', 1], ['updated', 2]]);
});

// The double writes each row with a kind outside the table's check, whose
// violation throws; only a rollback keeps the integration intact.
test('an update whose audit row the table refuses rolls back with the integration, its secrets, and its revision intact', async () => {
  const stored = await added();
  const tampering = {
    readOnly: <Value>(work: TransactionWork<Value>) => database.readOnly(work),
    transaction: <Value>(work: TransactionWork<Value>) => database.transaction((tx) => {
      const records = tx.scmIntegrationAudit;
      const scmIntegrationAudit = { append: (event: Parameters<typeof records.append>[0]) => records.append({ ...event, kind: 'tampered' as 'updated' }) };
      return work({ ...tx, scmIntegrationAudit } as unknown as typeof tx);
    }),
  };
  const failing = new PostgresScmIntegrations(tampering, cipher);
  const change = { expectedRevision: 1, label: 'Rolled back', secrets: secrets({ 'webhook-secret': 'synthetic-rolled-back' }) };
  const refused = /scm_integration_audit_events_kind_check/;
  await assert.rejects(failing.update(stored.integrationId, change, ENTRY), refused);
  await assert.rejects(failing.add(integration(), secrets({ 'webhook-secret': SECRET }), ENTRY), refused);
  assert.deepEqual(value(await store.get(stored.integrationId)), stored);
  assert.deepEqual(value(await store.configurationOf(stored.integrationId))?.secrets.reveal(), { 'signing-key': SECRET, 'webhook-secret': SECRET });
  const rows = await query<{ integration_id: string; kind: string }>(url, 'SELECT integration_id, kind FROM scm_integration_audit_events');
  assert.deepEqual(rows.filter((row) => row.integration_id === stored.integrationId), [{ integration_id: stored.integrationId, kind: 'created' }]);
  const created = rows.filter((row) => row.kind === 'created').length;
  assert.equal(value(await store.page(undefined, 100)).length, created, 'the failed creation left no integration');
});

test('the audit rows hold the field and secret names, the actor, and the reason, and no secret value', async () => {
  const stored = await added();
  value(await store.update(stored.integrationId, { expectedRevision: 1, secrets: secrets({ 'webhook-secret': 'synthetic-rotated' }) }, ENTRY));
  const rows = await query<Record<string, unknown>>(url, `SELECT kind, actor, reason, changed_fields, revision, occurred_at
    FROM scm_integration_audit_events WHERE integration_id = $1 ORDER BY position`, [stored.integrationId]);
  assert.deepEqual(rows.map((row) => [row.kind, row.actor, row.reason, row.changed_fields, row.revision]), [
    ['created', ENTRY.actor, ENTRY.reason, ['pluginId', 'label', 'allowedOrigin', 'settings.account-id', 'secrets.signing-key', 'secrets.webhook-secret'], 1],
    ['secret-changed', ENTRY.actor, ENTRY.reason, ['secrets.webhook-secret'], 2],
  ]);
  assert.ok(!JSON.stringify(rows).includes(SECRET) && !JSON.stringify(rows).includes('synthetic-rotated'));
});
