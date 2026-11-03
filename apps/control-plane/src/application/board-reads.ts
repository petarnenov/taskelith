import type {
  CardCatalog,
  NeedsYouItemId,
  ReconciliationAnswers,
  SessionTimelineTransaction,
  Task,
  UnrecordedProcess,
  WorkerId,
} from '@taskelith/execution';
import type { Instant, Result } from '@taskelith/kernel';
import type { AssignmentRepository, PlacementOutcomeRecords, WorkerOccupancy, WorkerPlacementRecord } from '@taskelith/scheduling';
import type { AdmissionRepository, GateRepository, ProjectId, WorkflowRunRepository } from '@taskelith/sdlc';

// What the board's views read in one snapshot, the event log's head
// included; PostgreSQL serves it from one transaction.
export interface BoardReads {
  head(): Promise<Result<number>>;
  now(): Promise<Instant>;
  readonly cards: Pick<CardCatalog, 'get' | 'listByProject' | 'tasks'>;
  readonly runs: Pick<WorkflowRunRepository, 'get'>;
  readonly gates: Pick<GateRepository, 'listByRun'>;
  readonly tasks: { get(id: Task['id']): Promise<Result<Task>> };
  readonly admissions: Pick<AdmissionRepository, 'get'>;
  readonly timeline: SessionTimelineTransaction;
  readonly placementOutcomes: Pick<PlacementOutcomeRecords, 'get'>;
  readonly assignments: Pick<AssignmentRepository, 'listByAttempt'>;
  readonly fleet: FleetReads;
  readonly reconciliation: ReconciliationRecordReads;
  autoMergeEnabled(projectId: ProjectId): Promise<Result<boolean>>;
}

export interface FleetReads {
  // Every enrolled worker that is not revoked.
  workers(): Promise<Result<readonly WorkerPlacementRecord[]>>;
  quarantined(): Promise<boolean>;
  occupancy(workerId: WorkerId): Promise<WorkerOccupancy>;
  heldForAttempt(attemptId: Task['attempts'][number]['id']): Promise<boolean>;
}

// The reconciliation records beyond the cards' tasks: the queue's
// unrecorded processes, the answers, and the projector's closing times.
export interface ReconciliationRecordReads {
  unrecordedProcesses(): Promise<readonly UnrecordedProcess[]>;
  readonly answers: Pick<ReconciliationAnswers, 'get'>;
  // The card projector's record: when it first saw the item closed, if it did.
  closedAt(itemId: NeedsYouItemId): Promise<Result<Instant | undefined>>;
}

// Each view's reads run in one read-only REPEATABLE READ snapshot.
export interface BoardStore {
  snapshot<Value>(work: (reads: BoardReads) => Promise<Result<Value>>): Promise<Result<Value>>;
}
