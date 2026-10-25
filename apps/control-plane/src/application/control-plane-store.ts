import type { Instant, Result } from '@taskelith/kernel';
import type { TaskRepository } from '@taskelith/execution';
import type { TaskLineage } from '@taskelith/scheduling';
import type { AdmissionRepository, GateRepository, Outbox, RunCatalog, WorkflowRunRepository } from '@taskelith/sdlc';

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
  now(): Promise<Instant>;
}

// An `Err` from the work rolls the whole transaction back.
export interface ControlPlaneStore {
  transaction<Value>(work: (transaction: ControlPlaneTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}
