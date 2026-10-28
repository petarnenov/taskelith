import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { ACCESS_STORE_CONFORMANCE, OwnerBootstrapService } from '@taskelith/access';
import { instantFromEpochMilliseconds } from '@taskelith/kernel';
import { PostgresAccessStore, PostgresDatabase } from '@taskelith/postgres';
import { NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';
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

test('two control-plane starts that create the owner at once create one principal and one audit event', { concurrency: false }, async () => {
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
    assert.deepEqual(await query(url, 'SELECT kind FROM access_audit_events'), [{ kind: 'access.owner-created' }]);
    assert.deepEqual(await query(url, 'SELECT role FROM installation_roles'), [{ role: 'installation-owner' }]);
  } finally {
    await other.close();
  }
});
