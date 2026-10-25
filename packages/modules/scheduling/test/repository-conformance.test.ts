import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConformanceCase } from '@taskelith/sdlc';
import { InMemoryTaskRepository } from '@taskelith/execution';
import {
  ASSIGNMENT_REPOSITORY_CONFORMANCE,
  CANDIDATE_WORKER_FIXTURES,
  CAPACITY_LEDGER_CONFORMANCE,
  DELEGATION_REQUESTS_CONFORMANCE,
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryDelegationRequests,
  InMemoryInstallationGuard,
  InMemoryPlacementQueue,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryTaskLineage,
  PLACEMENT_CANDIDATES_CONFORMANCE,
  PLACEMENT_QUEUE_CONFORMANCE,
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

runSuite('in-memory candidates', PLACEMENT_CANDIDATES_CONFORMANCE, () => {
  const assignments = new InMemoryAssignmentRepository();
  return { workers: new InMemoryPlacementWorkers(CANDIDATE_WORKER_FIXTURES, () => assignments.all()), assignments };
});
runSuite('in-memory placement queue', PLACEMENT_QUEUE_CONFORMANCE, () => {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const assignments = new InMemoryAssignmentRepository();
  return { queue: new InMemoryPlacementQueue(() => tasks.all(), lineage, () => assignments.all()), tasks, lineage, assignments };
});
runSuite('in-memory delegation requests', DELEGATION_REQUESTS_CONFORMANCE, () => new InMemoryDelegationRequests());

test('workers without assignments are candidates in identity order', async () => {
  assert.deepEqual(await new InMemoryPlacementWorkers(CANDIDATE_WORKER_FIXTURES).candidates(), ['worker-a', 'worker-b', 'worker-c', 'worker-d']);
});

test('an installation without its record admits nothing, as one in quarantine', async () => {
  assert.equal(await new InMemoryInstallationGuard(undefined).quarantined(), true);
  assert.equal(await new InMemoryInstallationGuard(true).quarantined(), true);
  assert.equal(await new InMemoryInstallationGuard(false).quarantined(), false);
});
