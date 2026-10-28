import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  ACCESS_STORE_CONFORMANCE,
  LoginThrottle,
  OwnerBootstrapService,
  SessionService,
  type AccessStore,
  type AccessTransaction,
  type LoginName,
  type PasswordHash,
  type PasswordHasher,
  type PrincipalId,
} from '@taskelith/access';
import { instantFromEpochMilliseconds, ok } from '@taskelith/kernel';
import { PostgresAccessStore, PostgresDatabase } from '@taskelith/postgres';
import { NodeSecrets } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

for (const conformance of ACCESS_STORE_CONFORMANCE) {
  test(`PostgreSQL access store: ${conformance.name}`, { concurrency: false }, async () => {
    await truncateAll(url);
    assert.deepEqual(await conformance.check(new PostgresAccessStore(database)), []);
  });
}

test('two control-plane starts that create the owner at once create one principal and audit the repeat', { concurrency: false }, async () => {
  await truncateAll(url);
  const other = new PostgresDatabase(url);
  try {
    const clock = { now: () => value(instantFromEpochMilliseconds(Date.now())) };
    const invocation = { actor: 'control-plane', reason: 'bootstrap owner from the G2 operator credential' };
    const starts = [database, other].map((pool) => new OwnerBootstrapService({ store: new PostgresAccessStore(pool), random: new NodeSecrets(), clock }));
    const results = await Promise.all(starts.map((service) => service.ensureOwner(invocation)));
    assert.deepEqual(results.map((result) => value(result).created).sort(), [false, true]);
    assert.equal(value(results[0]!).principalId, value(results[1]!).principalId);
    assert.deepEqual(await query(url, 'SELECT login_name FROM principals'), [{ login_name: 'owner' }]);
    const kinds = await query(url, 'SELECT kind, principal_id FROM access_audit_events ORDER BY position');
    const owner = value(results[0]!).principalId;
    assert.deepEqual(kinds, [
      { kind: 'access.owner-created', principal_id: owner }, { kind: 'access.owner-bootstrap-repeated', principal_id: owner },
    ]);
    assert.deepEqual(await query(url, 'SELECT role FROM installation_roles'), [{ role: 'installation-owner' }]);
  } finally {
    await other.close();
  }
});

const clock = { now: () => value(instantFromEpochMilliseconds(Date.now())) };
const ALICE = `u${'a'.repeat(32)}` as PrincipalId;

// A stand-in hasher: the hash of a password is the password with a prefix.
const plainHasher: PasswordHasher = {
  hash: async (password) => ok(`plain:${password}` as PasswordHash),
  verify: async (password, stored) => ok({ matches: stored === `plain:${password}`, rehashDue: false }),
};

// Holds the first principal read of any transaction until `open` is called.
function gatedStore(inner: AccessStore) {
  let open!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const waiting = new Promise<void>((resolve) => { reached = resolve; });
  let armed = true;
  const gatedGet = (principals: AccessTransaction['principals']) => async (principalId: PrincipalId) => {
    const read = await principals.get(principalId);
    if (armed) {
      armed = false;
      reached();
      await gate;
    }
    return read;
  };
  const store: AccessStore = {
    transaction: (work) => inner.transaction((tx) => {
      const principals = new Proxy(tx.principals, {
        get: (target, key) => (key === 'get' ? gatedGet(target) : Reflect.get(target, key).bind(target)),
      });
      return work(new Proxy(tx, { get: (target, key) => (key === 'principals' ? principals : Reflect.get(target, key)) }));
    }),
  };
  return { store, waiting, open };
}

test('a password change committed during a login rotation on PostgreSQL refuses the login', { concurrency: false }, async () => {
  await truncateAll(url);
  const other = new PostgresDatabase(url);
  try {
    const password = 'correct horse battery staple';
    value(await new PostgresAccessStore(database).transaction((tx) => tx.principals.add({
      principalId: ALICE, kind: 'operator', loginName: 'alice' as LoginName, passwordHash: `plain:${password}` as PasswordHash, createdAt: clock.now(),
    })));
    const { store, waiting, open } = gatedStore(new PostgresAccessStore(database));
    const throttle = new LoginThrottle({ clock, sleep: async () => undefined });
    const secrets = new NodeSecrets();
    const sessions = new SessionService({ store, hasher: plainHasher, secrets, random: secrets, clock, throttle });
    const started = value(await sessions.start());
    const live = value(await sessions.authenticate(started.cookie!));
    const login = sessions.logIn(live, { loginName: 'alice', password, sourceAddress: '192.0.2.7' });
    await waiting;
    const changed = 'plain:another long passphrase' as PasswordHash;
    value(await new PostgresAccessStore(other).transaction(async (tx) => {
      value(await tx.principals.setPasswordHash(ALICE, changed));
      return tx.sessions.endAllOf(ALICE, clock.now());
    }));
    open();
    assert.equal(failed(await login).details.reason, 'login-failed');
    assert.deepEqual(await query(url, 'SELECT password_hash FROM principals'), [{ password_hash: changed }], 'the new hash stays');
    assert.deepEqual(await query(url, 'SELECT principal_id FROM browser_sessions'), [{ principal_id: null }], 'no session logged in');
  } finally {
    await other.close();
  }
});

test('a principal row of an unknown kind is refused, not read as an operator', { concurrency: false }, async () => {
  await truncateAll(url);
  await query(url, 'ALTER TABLE principals DROP CONSTRAINT principals_kind_check');
  try {
    await query(url, `INSERT INTO principals (principal_id, kind, login_name, created_at) VALUES ($1, 'delegate', 'robot', now())`, [ALICE]);
    const store = new PostgresAccessStore(database);
    assert.equal(failed(await store.transaction((tx) => tx.principals.get(ALICE))).code, 'internal');
    assert.equal(failed(await store.transaction((tx) => tx.principals.findByLoginName('robot' as LoginName))).code, 'internal');
  } finally {
    await query(url, 'DELETE FROM principals');
    await query(url, `ALTER TABLE principals ADD CONSTRAINT principals_kind_check CHECK (kind IN ('operator'))`);
  }
});
