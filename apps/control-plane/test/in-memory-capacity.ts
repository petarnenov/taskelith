import {
  InMemoryInbox,
  InMemoryInventoryReports,
  InMemoryInventoryRequests,
  InMemoryProducerCursors,
  type InMemoryTaskRepository,
} from '@taskelith/execution';
import { InMemoryOutbox } from '@taskelith/sdlc';
import {
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryDelegationRequests,
  InMemoryInstallationGuard,
  InMemoryOutboxLookup,
  InMemoryPlacementQueue,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryWorkerReports,
  type InMemoryTaskLineage,
  type WorkerPlacementRecord,
} from '@taskelith/scheduling';

// The capacity, observation, and inventory members of an in-memory
// transaction, over its own task, lineage, and outbox stores.
export function inMemoryCapacity(
  tasks: InMemoryTaskRepository, lineage: InMemoryTaskLineage, records: readonly WorkerPlacementRecord[] = [], outbox = new InMemoryOutbox(),
) {
  const assignments = new InMemoryAssignmentRepository();
  const workers = new InMemoryPlacementWorkers(records, () => assignments.all());
  return {
    assignments,
    workers,
    installation: new InMemoryInstallationGuard(false),
    quotas: new InMemoryQuotaSettings(),
    ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage),
    placements: new InMemoryPlacementQueue(() => tasks.all(), lineage, () => assignments.all()),
    delegations: new InMemoryDelegationRequests(),
    inbox: new InMemoryInbox(),
    cursors: new InMemoryProducerCursors(),
    reports: new InMemoryWorkerReports(workers),
    outbox,
    outboxLookup: new InMemoryOutboxLookup(() => outbox.messages),
    inventoryRequests: new InMemoryInventoryRequests(),
    inventoryReports: new InMemoryInventoryReports(),
  };
}
