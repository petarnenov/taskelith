import type { Instant, Result } from '@taskelith/kernel';
import type { AttemptId, EvidenceRecords, LaunchRecords, TaskRepository, WorkerId } from '@taskelith/execution';
import type { EnrolledWorker } from '@taskelith/fleet';
import type { AssignmentRepository, InstallationGuard, TaskLineage } from '@taskelith/scheduling';
import type {
  AdmissionRepository,
  CurrentRevisions,
  GateRepository,
  Outbox,
  OwnershipGeneration,
  RunCatalog,
  WorkflowRunRepository,
} from '@taskelith/sdlc';

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
  readonly revisions: CurrentRevisions;
  readonly assignments: AssignmentRepository;
  readonly installation: InstallationGuard;
  readonly launches: LaunchRecords;
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
  // READ COMMITTED: a statement after a lock wait sees what committed during
  // it, which a SERIALIZABLE snapshot taken before the grant would miss.
  readCommitted<Value>(work: (transaction: ControlPlaneTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}
