import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConformanceCase } from '@taskelith/sdlc';
import {
  ASSIGNMENT_REPOSITORY_CONFORMANCE,
  CAPACITY_LEDGER_CONFORMANCE,
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryInstallationGuard,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryTaskLineage,
  PLACEMENT_WORKERS_CONFORMANCE,
  PLACEMENT_WORKER_FIXTURES,
  QUOTA_FIXTURES,
  QUOTA_SETTINGS_CONFORMANCE,
  TASK_LINEAGE_CONFORMANCE,
} from '@taskelith/scheduling';

for (const conformance of ASSIGNMENT_REPOSITORY_CONFORMANCE) {
  test(`in-memory assignments: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryAssignmentRepository()), []);
  });
}

function runSuite<Port>(adapter: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`${adapter}: ${conformance.name}`, async () => {
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('in-memory workers', PLACEMENT_WORKERS_CONFORMANCE, () => new InMemoryPlacementWorkers(PLACEMENT_WORKER_FIXTURES));
runSuite('in-memory quotas', QUOTA_SETTINGS_CONFORMANCE, () => new InMemoryQuotaSettings(new Map([QUOTA_FIXTURES.project]), new Map([QUOTA_FIXTURES.run])));
runSuite('in-memory lineage', TASK_LINEAGE_CONFORMANCE, () => new InMemoryTaskLineage());
runSuite('in-memory ledger', CAPACITY_LEDGER_CONFORMANCE, () => {
  const assignments = new InMemoryAssignmentRepository();
  const lineage = new InMemoryTaskLineage();
  return { ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage), assignments, lineage };
});

test('an installation without its record admits nothing, as one in quarantine', async () => {
  assert.equal(await new InMemoryInstallationGuard(undefined).quarantined(), true);
  assert.equal(await new InMemoryInstallationGuard(true).quarantined(), true);
  assert.equal(await new InMemoryInstallationGuard(false).quarantined(), false);
});
