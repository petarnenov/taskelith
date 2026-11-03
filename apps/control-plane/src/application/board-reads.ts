import type { CardCatalog, CardTask, SessionTimelineTransaction, Task, WorkerId } from '@taskelith/execution';
import type { Instant, Result } from '@taskelith/kernel';
import type { AssignmentRepository, PlacementOutcomeRecords, WorkerOccupancy, WorkerPlacementRecord } from '@taskelith/scheduling';
import type { AdmissionRepository, GateRepository, ProjectId, WorkflowRunId, WorkflowRunRepository } from '@taskelith/sdlc';

// What the board's views read in one snapshot, the event log's head
// included; PostgreSQL serves it from one transaction.
export interface BoardReads {
  head(): Promise<Result<number>>;
  now(): Promise<Instant>;
  readonly cards: Pick<CardCatalog, 'get' | 'listByProject'> & CardLineage;
  readonly runs: Pick<WorkflowRunRepository, 'get'>;
  readonly gates: Pick<GateRepository, 'listByRun'>;
  readonly tasks: { get(id: Task['id']): Promise<Result<Task>> };
  readonly admissions: Pick<AdmissionRepository, 'get'>;
  readonly timeline: SessionTimelineTransaction;
  readonly placementOutcomes: Pick<PlacementOutcomeRecords, 'get'>;
  readonly assignments: Pick<AssignmentRepository, 'listByAttempt'>;
  readonly fleet: FleetReads;
  autoMergeEnabled(projectId: ProjectId): Promise<Result<boolean>>;
}

// Every task of a card's lineage, in admission order.
export interface CardLineage {
  tasks(runId: WorkflowRunId): Promise<Result<readonly CardTask[]>>;
}

export interface FleetReads {
  // Every enrolled worker that is not revoked.
  workers(): Promise<Result<readonly WorkerPlacementRecord[]>>;
  quarantined(): Promise<boolean>;
  occupancy(workerId: WorkerId): Promise<WorkerOccupancy>;
  heldForAttempt(attemptId: Task['attempts'][number]['id']): Promise<boolean>;
}

// Each view's reads run in one read-only REPEATABLE READ snapshot.
export interface BoardStore {
  snapshot<Value>(work: (reads: BoardReads) => Promise<Result<Value>>): Promise<Result<Value>>;
}
