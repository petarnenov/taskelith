import type { Result } from '@taskelith/kernel';
import type { AttemptId, EvidenceRecords, Inbox, LaunchRecords, ProducerCursors, WorkerId } from '@taskelith/execution';
import type { EnrolledWorker } from '@taskelith/fleet';
import type { CapacityTransaction, DelegationRequests, PlacementQueue, WorkerReports } from '@taskelith/scheduling';
import type {
  CurrentRevisions,
  GateRepository,
  OwnershipGeneration,
  RunCatalog,
  WorkflowRunRepository,
} from '@taskelith/sdlc';

// What the use cases read and write in one SERIALIZABLE transaction, the
// reservation's included. PostgresTransaction provides it.
export interface ControlPlaneTransaction extends CapacityTransaction {
  readonly runs: WorkflowRunRepository;
  readonly catalog: RunCatalog;
  readonly gates: GateRepository;
  readonly evidence: EvidenceRecords;
  readonly producers: EvidenceProducers;
  readonly fleet: WorkerDirectory;
  readonly revisions: CurrentRevisions;
  readonly launches: LaunchRecords;
  readonly placements: PlacementQueue;
  readonly delegations: DelegationRequests;
  readonly inbox: Inbox;
  readonly cursors: ProducerCursors;
  readonly reports: WorkerReports;
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
