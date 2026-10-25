import type { Instant, Result } from '@taskelith/kernel';
import type { AttemptId, EvidenceRecords, TaskRepository, WorkerId } from '@taskelith/execution';
import type { EnrolledWorker } from '@taskelith/fleet';
import type { TaskLineage } from '@taskelith/scheduling';
import type { AdmissionRepository, GateRepository, Outbox, OwnershipGeneration, RunCatalog, WorkflowRunRepository } from '@taskelith/sdlc';

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
  readonly evidence: EvidenceRecords;
  readonly producers: EvidenceProducers;
  readonly fleet: WorkerDirectory;
  now(): Promise<Instant>;
}

// An enrolled worker as the transaction reads it, revoked or not.
export interface WorkerDirectory {
  worker(workerId: WorkerId): Promise<Result<EnrolledWorker | undefined>>;
}

// The generations at which a worker held an attempt, from its assignments.
export interface EvidenceProducers {
  heldGenerations(workerId: WorkerId, attemptId: AttemptId): Promise<Result<readonly OwnershipGeneration[]>>;
}

// An `Err` from the work rolls the whole transaction back.
export interface ControlPlaneStore {
  transaction<Value>(work: (transaction: ControlPlaneTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}
