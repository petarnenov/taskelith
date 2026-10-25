import type { InMemoryTaskRepository } from '@taskelith/execution';
import {
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryDelegationRequests,
  InMemoryInstallationGuard,
  InMemoryPlacementQueue,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  type InMemoryTaskLineage,
} from '@taskelith/scheduling';

// The capacity members of an in-memory transaction, over its own task and
// lineage stores, with no worker enrolled.
export function inMemoryCapacity(tasks: InMemoryTaskRepository, lineage: InMemoryTaskLineage) {
  const assignments = new InMemoryAssignmentRepository();
  return {
    assignments,
    workers: new InMemoryPlacementWorkers([], () => assignments.all()),
    installation: new InMemoryInstallationGuard(false),
    quotas: new InMemoryQuotaSettings(),
    ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage),
    placements: new InMemoryPlacementQueue(() => tasks.all(), lineage, () => assignments.all()),
    delegations: new InMemoryDelegationRequests(),
  };
}
