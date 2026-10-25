import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { INVENTORY_REPORTS_CONFORMANCE, INVENTORY_REQUESTS_CONFORMANCE, PRODUCER_CURSORS_CONFORMANCE } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import { PostgresDatabase, type PostgresTransaction } from '@taskelith/postgres';
import {
  CANDIDATE_WORKER_FIXTURES,
  CAPACITY_LEDGER_CONFORMANCE,
  DELEGATION_REQUESTS_CONFORMANCE,
  OUTBOX_LOOKUP_CONFORMANCE,
  PLACEMENT_CANDIDATES_CONFORMANCE,
  PLACEMENT_QUEUE_CONFORMANCE,
  PLACEMENT_WORKERS_CONFORMANCE,
  PLACEMENT_WORKER_FIXTURES,
  QUOTA_FIXTURES,
  QUOTA_SETTINGS_CONFORMANCE,
  REPORTING_WORKER_FIXTURE,
  TASK_LINEAGE_CONFORMANCE,
  WORKER_REPORTS_CONFORMANCE,
  type PlacementWorkers,
  type WorkerReports,
  type WorkerReportsConformanceTarget,
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
runSuite('candidates', PLACEMENT_CANDIDATES_CONFORMANCE, (tx) => ({ workers: tx.workers, assignments: tx.assignments }), async () => {
  for (const worker of CANDIDATE_WORKER_FIXTURES) await seedWorker(url, worker);
});
runSuite('placement queue', PLACEMENT_QUEUE_CONFORMANCE, (tx) => ({ queue: tx.placements, tasks: tx.tasks, lineage: tx.lineage, assignments: tx.assignments }));
runSuite('delegation requests', DELEGATION_REQUESTS_CONFORMANCE, (tx) => tx.delegations);
runSuite('producer cursors', PRODUCER_CURSORS_CONFORMANCE, (tx) => tx.cursors);
runSuite('inventory requests', INVENTORY_REQUESTS_CONFORMANCE, (tx) => tx.inventoryRequests);
runSuite('inventory reports', INVENTORY_REPORTS_CONFORMANCE, (tx) => tx.inventoryReports);
runSuite('outbox lookup', OUTBOX_LOOKUP_CONFORMANCE, (tx) => ({ outbox: tx.outbox, lookup: tx.outboxLookup }));

// Each report commits on its own, as each observation's transaction does,
// so a case can add a worker or race two reports.
function committingReports(): WorkerReportsConformanceTarget {
  const write = (work: (reports: WorkerReports) => Promise<Result<void>>) => database.transaction((tx) => work(tx.reports));
  const read = async <Value>(work: (workers: PlacementWorkers) => Promise<Value>): Promise<Value> => {
    const outcome = await database.readCommitted(async (tx) => ok(await work(tx.workers)));
    if (!outcome.ok) throw new Error(outcome.error.message);
    return outcome.value;
  };
  return {
    reports: {
      recordContact: (...args) => write((reports) => reports.recordContact(...args)),
      recordJournalLoss: (...args) => write((reports) => reports.recordJournalLoss(...args)),
      restartFences: (...args) => write((reports) => reports.restartFences(...args)),
      declareCapacity: (...args) => write((reports) => reports.declareCapacity(...args)),
      enterPressure: (...args) => write((reports) => reports.enterPressure(...args)),
      leavePressure: (...args) => write((reports) => reports.leavePressure(...args)),
      markCapacityRefused: (...args) => write((reports) => reports.markCapacityRefused(...args)),
      clearCapacityRefusal: (...args) => write((reports) => reports.clearCapacityRefusal(...args)),
      setProtocolVersion: (...args) => write((reports) => reports.setProtocolVersion(...args)),
    },
    workers: {
      get: (workerId) => read((workers) => workers.get(workerId)),
      eligibleSlots: () => read((workers) => workers.eligibleSlots()),
      candidates: () => read((workers) => workers.candidates()),
    },
    addWorker: (worker) => seedWorker(url, worker),
  };
}

for (const conformance of WORKER_REPORTS_CONFORMANCE) {
  test(`PostgreSQL worker reports: ${conformance.name}`, async () => {
    await truncateAll(url);
    await seedWorker(url, REPORTING_WORKER_FIXTURE);
    assert.deepEqual(await conformance.check(committingReports()), []);
  });
}

test('an installation without its record is treated as quarantined', async () => {
  await truncateAll(url);
  const read = () => database.transaction(async (tx) => ({ ok: true, value: await tx.installation.quarantined() }));
  assert.deepEqual(await read(), { ok: true, value: true });
  await query(url, 'INSERT INTO installation (quarantined) VALUES (false)');
  assert.deepEqual(await read(), { ok: true, value: false });
});
