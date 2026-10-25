import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PostgresDatabase, type PostgresTransaction } from '@taskelith/postgres';
import {
  CAPACITY_LEDGER_CONFORMANCE,
  PLACEMENT_WORKERS_CONFORMANCE,
  PLACEMENT_WORKER_FIXTURES,
  QUOTA_FIXTURES,
  QUOTA_SETTINGS_CONFORMANCE,
  TASK_LINEAGE_CONFORMANCE,
} from '@taskelith/scheduling';
import type { ConformanceCase } from '@taskelith/sdlc';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';
import { seedWorker } from './capacity-fixtures.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

// Each case runs inside one transaction, as the reservation transaction reads
// these ports, and starts from empty tables.
function runSuite<Port>(port: string, cases: readonly ConformanceCase<Port>[], pick: (tx: PostgresTransaction) => Port, seed = async () => {}): void {
  for (const conformance of cases) {
    test(`PostgreSQL ${port}: ${conformance.name}`, async () => {
      await truncateAll(url);
      await seed();
      const result = await database.transaction(async (tx) => ({ ok: true, value: await conformance.check(pick(tx)) }));
      assert.deepEqual(result, { ok: true, value: [] });
    });
  }
}

runSuite('workers', PLACEMENT_WORKERS_CONFORMANCE, (tx) => tx.workers, async () => {
  for (const worker of PLACEMENT_WORKER_FIXTURES) await seedWorker(url, worker);
});
runSuite('quotas', QUOTA_SETTINGS_CONFORMANCE, (tx) => tx.quotas, async () => {
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, $2), ('run', $3, $4)",
    [...QUOTA_FIXTURES.project, ...QUOTA_FIXTURES.run]);
});
runSuite('lineage', TASK_LINEAGE_CONFORMANCE, (tx) => tx.lineage);
runSuite('ledger', CAPACITY_LEDGER_CONFORMANCE, (tx) => ({ ledger: tx.ledger, assignments: tx.assignments, lineage: tx.lineage }));

test('an installation without its record is treated as quarantined', async () => {
  await truncateAll(url);
  const read = () => database.transaction(async (tx) => ({ ok: true, value: await tx.installation.quarantined() }));
  assert.deepEqual(await read(), { ok: true, value: true });
  await query(url, 'INSERT INTO installation (quarantined) VALUES (false)');
  assert.deepEqual(await read(), { ok: true, value: false });
});
