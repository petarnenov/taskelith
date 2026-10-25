import { InMemoryInbox, InMemoryProducerCursors, type InMemoryTaskRepository } from '@taskelith/execution';
import {
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryDelegationRequests,
  InMemoryInstallationGuard,
  InMemoryPlacementQueue,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryWorkerReports,
  type InMemoryTaskLineage,
  type WorkerPlacementRecord,
} from '@taskelith/scheduling';

// The capacity and observation members of an in-memory transaction, over
// its own task and lineage stores, with the given workers.
export function inMemoryCapacity(tasks: InMemoryTaskRepository, lineage: InMemoryTaskLineage, records: readonly WorkerPlacementRecord[] = []) {
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
  };
}
