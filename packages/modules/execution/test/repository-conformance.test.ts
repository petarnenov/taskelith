import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INBOX_CONFORMANCE,
  INVENTORY_REPORTS_CONFORMANCE,
  INVENTORY_REQUESTS_CONFORMANCE,
  InMemoryInbox,
  InMemoryInventoryReports,
  InMemoryInventoryRequests,
  InMemoryProducerCursors,
  InMemoryTaskRepository,
  PRODUCER_CURSORS_CONFORMANCE,
  RECONCILIATION_QUEUE_CONFORMANCE,
  InMemoryReconciliationQueue,
  InMemoryUnrecordedProcesses,
  TASK_REPOSITORY_CONFORMANCE,
} from '@taskelith/execution';
import type { ConformanceCase } from '@taskelith/sdlc';

function runSuite<Port>(adapter: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`${adapter}: ${conformance.name}`, async () => {
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('in-memory tasks', TASK_REPOSITORY_CONFORMANCE, () => new InMemoryTaskRepository());
runSuite('in-memory inbox', INBOX_CONFORMANCE, () => new InMemoryInbox());
runSuite('in-memory producer cursors', PRODUCER_CURSORS_CONFORMANCE, () => new InMemoryProducerCursors());
runSuite('in-memory inventory requests', INVENTORY_REQUESTS_CONFORMANCE, () => new InMemoryInventoryRequests());
runSuite('in-memory inventory reports', INVENTORY_REPORTS_CONFORMANCE, () => new InMemoryInventoryReports());
runSuite('in-memory reconciliation queue', RECONCILIATION_QUEUE_CONFORMANCE, () => {
  const tasks = new InMemoryTaskRepository();
  const processes = new InMemoryUnrecordedProcesses();
  return { tasks, processes, queue: new InMemoryReconciliationQueue(() => tasks.all(), processes) };
});
