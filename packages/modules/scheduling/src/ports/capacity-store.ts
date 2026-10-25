import type { Instant, Result } from '@taskelith/kernel';
import type { TaskRepository } from '@taskelith/execution';
import type { AssignmentRepository } from './assignment-repository.js';
import type { CapacityLedger } from './capacity-ledger.js';
import type { InstallationGuard } from './installation-guard.js';
import type { Outbox } from './outbox.js';
import type { PlacementWorkers } from './placement-workers.js';
import type { QuotaSettings } from './quota-settings.js';
import type { TaskLineage } from './task-lineage.js';

// Everything one reservation, release, or delegation reads and writes, in a
// single SERIALIZABLE transaction; `now` is the database clock.
export interface CapacityTransaction {
  readonly assignments: AssignmentRepository;
  readonly tasks: TaskRepository;
  readonly outbox: Outbox;
  readonly workers: PlacementWorkers;
  readonly installation: InstallationGuard;
  readonly quotas: QuotaSettings;
  readonly lineage: TaskLineage;
  readonly ledger: CapacityLedger;
  now(): Promise<Instant>;
}

// Runs work in one transaction, rerun as a whole after a lost serialization
// race; an `Err` from the work rolls everything back.
export interface CapacityStore {
  transaction<Value>(work: (transaction: CapacityTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}
