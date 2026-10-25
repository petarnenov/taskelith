import type { Instant, Result } from '@taskelith/kernel';
import type { LaunchRecords, TaskRepository } from '@taskelith/execution';
import type { FleetRegistry } from '@taskelith/fleet';
import type { AssignmentRepository, InstallationGuard, TaskLineage } from '@taskelith/scheduling';
import type { AdmissionRepository, CurrentRevisions, GateRepository, Outbox, RunCatalog, WorkflowRunRepository } from '@taskelith/sdlc';

// What the API's use cases read and write in one SERIALIZABLE transaction;
// `now` is the database clock. PostgresTransaction provides it.
export interface ControlPlaneTransaction {
  readonly runs: WorkflowRunRepository;
  readonly catalog: RunCatalog;
  readonly admissions: AdmissionRepository;
  readonly gates: GateRepository;
  readonly tasks: TaskRepository;
  readonly lineage: TaskLineage;
  readonly outbox: Outbox;
  readonly revisions: CurrentRevisions;
  readonly assignments: AssignmentRepository;
  readonly installation: InstallationGuard;
  readonly fleet: Pick<FleetRegistry, 'worker'>;
  readonly launches: LaunchRecords;
  now(): Promise<Instant>;
}

// An `Err` from the work rolls the whole transaction back.
export interface ControlPlaneStore {
  transaction<Value>(work: (transaction: ControlPlaneTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}
