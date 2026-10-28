import {
  InMemoryInbox,
  InMemoryInventoryReports,
  InMemoryInventoryRequests,
  InMemoryProducerCursors,
  InMemoryReconciliationQueue,
  InMemoryUnrecordedProcesses,
  type InMemoryTaskRepository,
} from '@taskelith/execution';
import { InMemoryWorkerAdmissions, fleetWorker, type FleetRegistry } from '@taskelith/fleet';
import { ok } from '@taskelith/kernel';
import { InMemoryOutbox } from '@taskelith/sdlc';
import {
  InMemoryAccountSlots,
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryDelegationRequests,
  InMemoryInstallationGuard,
  InMemoryOutboxLookup,
  InMemoryPlacementOutcomeRecords,
  InMemoryPlacementQueue,
  InMemoryPlacementRotation,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryWorkerReports,
  type InMemoryTaskLineage,
  type WorkerPlacementRecord,
} from '@taskelith/scheduling';

// The capacity, observation, inventory, and reconciliation members of an
// in-memory transaction, over its own task, lineage, and outbox stores.
export function inMemoryCapacity(
  tasks: InMemoryTaskRepository, lineage: InMemoryTaskLineage, records: readonly WorkerPlacementRecord[] = [], outbox = new InMemoryOutbox(),
  registry: WorkerRegistry = placementRegistry(records),
) {
  const assignments = new InMemoryAssignmentRepository();
  const workers = new InMemoryPlacementWorkers(records, () => assignments.all());
  const unrecordedProcesses = new InMemoryUnrecordedProcesses();
  const workerAdmissions = new InMemoryWorkerAdmissions({
    registry, now: () => '2026-10-28T09:00:00.000Z' as never,
    onAdmission: (workerId, admitted) => {
      const current = workers.current(workerId);
      if (current !== undefined) workers.replace({ ...current, admitted });
    },
  });
  return {
    workerAdmissions,
    assignments,
    workers,
    installation: new InMemoryInstallationGuard(false),
    quotas: new InMemoryQuotaSettings(),
    ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage),
    accountSlots: new InMemoryAccountSlots(),
    placements: new InMemoryPlacementQueue(() => tasks.all(), lineage, () => assignments.all()),
    rotation: new InMemoryPlacementRotation(),
    placementOutcomes: new InMemoryPlacementOutcomeRecords(),
    delegations: new InMemoryDelegationRequests(),
    inbox: new InMemoryInbox(),
    cursors: new InMemoryProducerCursors(),
    reports: new InMemoryWorkerReports(workers),
    outbox,
    outboxLookup: new InMemoryOutboxLookup(() => outbox.messages),
    inventoryRequests: new InMemoryInventoryRequests(),
    inventoryReports: new InMemoryInventoryReports(),
    unrecordedProcesses,
    reconciliation: new InMemoryReconciliationQueue(() => tasks.all(), unrecordedProcesses),
  };
}

type WorkerRegistry = Pick<FleetRegistry, 'worker' | 'activeWorkerIds'>;

// Each placement record stands for an enrolled worker of the same identity.
function placementRegistry(records: readonly WorkerPlacementRecord[]): WorkerRegistry {
  const enrolled = (workerId: string) => records.find((record) => record.workerId === workerId);
  return {
    worker: async (workerId) => ok(enrolled(workerId) === undefined ? undefined : fleetWorker(workerId, `journal-${workerId}`)),
    activeWorkerIds: async () => ok(records.map((record) => record.workerId)),
  };
}
