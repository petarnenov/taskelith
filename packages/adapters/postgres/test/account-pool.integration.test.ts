import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { after, beforeEach, test } from 'node:test';
import type { HarnessPluginId } from '@taskelith/execution';
import { PostgresDatabase, PostgresSlotCredentials, type SlotCredentialCipher } from '@taskelith/postgres';
import {
  ACCOUNT_SLOTS_CONFORMANCE,
  ADD_SLOT_DEADLINE_MILLISECONDS,
  SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE,
  SLOT_CREDENTIALS_CONFORMANCE,
  SlotSecret,
  StaticAdmittedDeliveries,
  addAccountSlot,
  parseSlotCredentialVersion,
  type AddAccountSlotInput,
  type CapacityStore,
  type ProjectId,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { AesGcmSlotCredentialCipher } from '@taskelith/secrets';
import { id, value } from '@taskelith/testing';
import { gatedStore, rendezvous } from './gated-transactions.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());
beforeEach(() => truncateAll(url));

const cipher = (): SlotCredentialCipher => value(AesGcmSlotCredentialCipher.of(randomBytes(32)));
const credentials = (sealer = cipher()) => new PostgresSlotCredentials((work) => database.transaction(work), sealer);

// Each case runs in one transaction, as the reservation transaction reads
// the slots, and starts from empty tables.
for (const conformance of ACCOUNT_SLOTS_CONFORMANCE) {
  test(`PostgreSQL account slots: ${conformance.name}`, async () => {
    const result = await database.transaction(async (tx) => ({ ok: true, value: await conformance.check(tx.accountSlots) }));
    assert.deepEqual(result, { ok: true, value: [] });
  });
}

// Each case runs in one transaction, as the delivery transaction does.
for (const conformance of SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE) {
  test(`PostgreSQL slot credential deliveries: ${conformance.name}`, async () => {
    const result = await database.transaction(async (tx) => ({ ok: true, value: await conformance.check(tx.slotCredentialDeliveries) }));
    assert.deepEqual(result, { ok: true, value: [] });
  });
}

// Each operation commits on its own, so the concurrent stores race.
for (const conformance of SLOT_CREDENTIALS_CONFORMANCE) {
  test(`PostgreSQL slot credentials: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(credentials()), []);
  });
}

// A value no fixture or log holds, so any sighting of it is a leak.
const sentinel = () => SlotSecret.of(`sentinel-${randomBytes(16).toString('hex')}`);
const SLOT = id('ProviderCredentialId', 'slot-1');
const VERSION_ONE = value(parseSlotCredentialVersion(1));

async function storedText(): Promise<string> {
  const rows = await query<{ text: string }>(url, `SELECT row_to_json(stored)::text AS text FROM (
    SELECT slot_id, version, encode(nonce, 'escape') AS nonce, encode(sealed, 'escape') AS sealed FROM slot_credentials
    UNION ALL SELECT slot_id, last_version, destroyed::text, '' FROM slot_credential_counters) AS stored`);
  return rows.map((row) => row.text).join('\n');
}

test('a stored credential is encrypted at rest and opens only with its key, slot, and version', async () => {
  const secret = value(sentinel());
  const sealer = cipher();
  const store = credentials(sealer);
  const version = await store.store(SLOT, secret);
  assert.ok(!(await storedText()).includes(secret.reveal()), 'the plaintext is in the database');
  assert.equal(value(await store.reveal(SLOT, version)).reveal(), secret.reveal());
  const otherKey = await credentials().reveal(SLOT, version);
  assert.equal(!otherKey.ok && otherKey.error.code, 'internal');
  assert.ok(!JSON.stringify(otherKey).includes(secret.reveal()));
  // A row moved to another slot or version fails authentication.
  await query(url, "INSERT INTO slot_credential_counters (slot_id, last_version, destroyed) VALUES ('slot-2', 5, false)");
  await query(url, "INSERT INTO slot_credentials (slot_id, version, nonce, sealed) SELECT 'slot-2', 5, nonce, sealed FROM slot_credentials");
  const moved = await store.reveal(id('ProviderCredentialId', 'slot-2'), value(parseSlotCredentialVersion(5)));
  assert.equal(!moved.ok && moved.error.code, 'internal');
});

test('a credential store that cannot commit rejects without the credential', async () => {
  const secret = value(sentinel());
  const closed = new PostgresDatabase(url);
  await closed.close();
  const store = new PostgresSlotCredentials((work) => closed.transaction(work), cipher());
  const rejection = await store.store(SLOT, secret).then(() => undefined, (error: unknown) => error);
  assert.ok(rejection instanceof Error);
  assert.ok(!inspect(rejection).includes(secret.reveal()), 'the rejection discloses the credential');
  await assert.rejects(store.reveal(SLOT, VERSION_ONE), (error: Error) => !error.message.includes(secret.reveal()));
});

test('the cipher prints and serializes as redacted', () => {
  const sealer = value(AesGcmSlotCredentialCipher.of(Buffer.alloc(32, 7)));
  for (const form of [String(sealer), JSON.stringify({ sealer }), inspect(sealer)]) {
    assert.ok(form.includes('[redacted]') && !form.includes('7,7') && !form.includes('BwcH'), form);
  }
  assert.equal(AesGcmSlotCredentialCipher.of(Buffer.alloc(16)).ok, false);
});

const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const MECHANISM = id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId;
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const ONE_SLOT = new StaticAdmittedDeliveries([{ harnessId: HARNESS, mechanismId: MECHANISM, delivery: 'subscription-token', slotLimit: 1 }]);

const STILL = () => 0;

function input(name: string, secret: SlotSecret): AddAccountSlotInput {
  return { id: id('ProviderCredentialId', name), harnessId: HARNESS, mechanismId: MECHANISM, allowedProjects: [PROJECT], secret };
}

test('of two concurrent adds for the last allowed slot at most one commits, and the other keeps no credential', async () => {
  // Both first attempts count before either inserts, so one must retry.
  const read = { member: 'accountSlots', method: 'countNotRemoved', arrive: rendezvous(2) } as const;
  const racers = [gatedStore(database, read), gatedStore(database, read)];
  const secrets = [value(sentinel()), value(sentinel())];
  const shared = credentials();
  const added = await Promise.all(['slot-a', 'slot-b'].map((name, index) => addAccountSlot(
    { store: racers[index]!.store, credentials: shared, deliveries: ONE_SLOT, monotonicMilliseconds: STILL }, input(name, secrets[index]!),
  )));
  assert.deepEqual(added.map((result) => result.ok).sort(), [false, true]);
  const loser = added.findIndex((result) => !result.ok);
  const refused = added[loser]!;
  assert.equal(!refused.ok && refused.error.code, 'invalid');
  assert.ok(racers[loser]!.attempts() >= 2, 'the refused add was not retried');
  assert.ok(!JSON.stringify(refused).includes(secrets[0]!.reveal()) && !JSON.stringify(refused).includes(secrets[1]!.reveal()));
  const slots = await query<{ slot_id: string }>(url, 'SELECT slot_id FROM account_slots');
  const kept = await query<{ slot_id: string }>(url, 'SELECT slot_id FROM slot_credentials');
  assert.equal(slots.length, 1);
  assert.deepEqual(kept, slots);
});

test('an add slower than its deadline rolls back, keeps no credential, and is retryable', async () => {
  const clock = { now: 0 };
  // The capacity transaction starts after the deadline has passed.
  const slow: CapacityStore = { transaction: (work) => {
    clock.now += ADD_SLOT_DEADLINE_MILLISECONDS + 1;
    return database.transaction(work);
  } };
  const ports = { store: slow, credentials: credentials(), deliveries: ONE_SLOT, monotonicMilliseconds: () => clock.now };
  const refused = await addAccountSlot(ports, input('slot-a', value(sentinel())));
  assert.deepEqual(!refused.ok && [refused.error.code, refused.error.details.reason], ['unavailable', 'add-deadline-exceeded']);
  assert.deepEqual(await query(url, 'SELECT slot_id FROM account_slots'), []);
  assert.deepEqual(await query(url, 'SELECT slot_id FROM slot_credentials'), []);
});

test('a revoked slot counts toward its pair limit and a removed one does not', async () => {
  const ports = { store: database, credentials: credentials(), deliveries: ONE_SLOT, monotonicMilliseconds: STILL };
  const first = value(await addAccountSlot(ports, input('slot-a', value(sentinel()))));
  await query(url, "UPDATE account_slots SET state = 'revoked', revision = 2 WHERE slot_id = $1", [first.id]);
  const blocked = await addAccountSlot(ports, input('slot-b', value(sentinel())));
  assert.equal(!blocked.ok && blocked.error.code, 'invalid');
  await query(url, "UPDATE account_slots SET state = 'removed', revision = 3 WHERE slot_id = $1", [first.id]);
  assert.equal((await addAccountSlot(ports, input('slot-b', value(sentinel())))).ok, true);
});
