import type { Instant, Result } from '@taskelith/kernel';
import type {
  AdmissionId,
  OwnershipGeneration,
  AdmissionState,
  BlockReason,
  EvidenceKind,
  GateId,
  GateState,
  NativeReference,
  PolicyRevision,
  ProjectId,
  StageId,
  StageOrigin,
  StageState,
  TaskId,
  WorkflowRunBinding,
  WorkflowRunId,
  WorkItemId,
} from '@taskelith/sdlc';
import type { AttemptOutcome } from '../domain/attempt.js';
import type { AttemptId } from '../domain/identifiers.js';
import type { WorkType } from '../domain/task-defaults.js';

// Board columns are the lifecycle stages under short labels; Accept and
// integrate is the merge gate between `review` and `archived`.
export const BOARD_COLUMNS = Object.freeze([
  'propose',
  'specify',
  'implement',
  'verify',
  'review',
  'archived',
] as const);

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

// The view's own merge gate values; Integrations' merge request states map
// onto them (product ports contract section 3.4).
export const MERGE_GATE_STATES = Object.freeze([
  'not-ready',
  'ready',
  'awaiting-manual-merge',
  'withdrawn',
  'queued',
  'merging',
  'resolving-conflict',
  'returned-to-specify',
  'escalated',
  'integrated',
] as const);

export type MergeGateState = (typeof MERGE_GATE_STATES)[number];

export const SESSION_ACTIVITIES = Object.freeze([
  'none',
  'working',
  'waiting-for-person',
  'waiting-for-admission',
  'stopped',
  'worker-unreachable',
  'process-uncertain',
] as const);

export type SessionActivityState = (typeof SESSION_ACTIVITIES)[number];

export const CARD_WAIT_KINDS = Object.freeze([
  'person',
  'stage-admission',
  'reviewer',
  'capacity',
  'merge-queue',
] as const);

export type CardWait = (typeof CARD_WAIT_KINDS)[number];

// Mirrors of Scheduling's reasons (contract section 3.8), since Execution
// cannot import Scheduling; a Scheduling test keeps them equal.
export const PLACEMENT_WAITING_REASONS = Object.freeze([
  'quarantined',
  'worker-not-eligible',
  'worker-capacity-exhausted',
  'project-quota-exhausted',
  'run-quota-exhausted',
  'provider-concurrency-exhausted',
  'control-not-enforceable',
  'delegation-awaiting-capacity',
  'no-candidate',
] as const);

export type PlacementWaitingReason = (typeof PLACEMENT_WAITING_REASONS)[number];

export const PLACEMENT_REJECTING_REASONS = Object.freeze([
  'resource-ceiling-exceeded',
  'spend-limit-not-enforceable',
  'delegation-depth-exceeded',
  'delegation-chain-exceeds-quota',
  'delegation-budget-exhausted',
  'retry-budget-exhausted',
] as const);

export type PlacementRejectingReason = (typeof PLACEMENT_REJECTING_REASONS)[number];

export const FLEET_OBSTACLE_REASONS = Object.freeze([
  'quarantined',
  'worker-not-eligible',
  'worker-capacity-exhausted',
  'no-candidate',
] as const);

export type FleetObstacleReason = (typeof FLEET_OBSTACLE_REASONS)[number];

export const WORKER_REFUSAL_REASONS = Object.freeze([
  'worker-slots-exhausted',
  'worker-capacity-exhausted',
  'resource-ceiling-exceeded',
  'control-not-enforceable',
  'worker-admission-pressure',
  'worker-self-check-failed',
  'protocol-not-supported',
] as const);

export type WorkerRefusalReason = (typeof WORKER_REFUSAL_REASONS)[number];

// An automatic retry that is not placed yet backs off (contract §3.8).
export const RETRY_BACKOFF_REASON = 'retry-backoff';

export const OBSTACLE_SOURCES = Object.freeze(['scheduler', 'worker', 'fleet', 'automatic-retry'] as const);

export type ObstacleSource = (typeof OBSTACLE_SOURCES)[number];

export const OBSTACLE_DISPOSITIONS = Object.freeze(['waiting', 'rejected'] as const);

export type ObstacleDisposition = (typeof OBSTACLE_DISPOSITIONS)[number];

interface ObstacleValues {
  readonly taskId: TaskId;
  readonly attemptId?: AttemptId;
  // When its source observed it; a fleet read uses the view's `asOf`.
  readonly observedAt: Instant;
}

// Why a task is not placed (contract section 3.8), the view's own value.
export type PlacementObstacle = ObstacleValues & (
  | { readonly source: 'scheduler'; readonly disposition: 'waiting'; readonly reason: PlacementWaitingReason }
  | { readonly source: 'scheduler'; readonly disposition: 'rejected'; readonly reason: PlacementRejectingReason }
  | { readonly source: 'worker'; readonly disposition: 'waiting'; readonly reason: WorkerRefusalReason }
  | { readonly source: 'fleet'; readonly disposition: 'waiting'; readonly reason: FleetObstacleReason }
  | {
      readonly source: 'automatic-retry';
      readonly disposition: 'waiting';
      readonly reason: typeof RETRY_BACKOFF_REASON;
      readonly retryNumber: number;
    }
);

export const TASK_END_KINDS = Object.freeze([
  'cancelled',
  'rejected',
  'retries-exhausted',
  'uncertain-exit',
] as const);

export type TaskEndKind = (typeof TASK_END_KINDS)[number];

// A task ended without a merge that only a re-admission resumes (3.9).
export interface TaskEnd {
  readonly kind: TaskEndKind;
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly outcome: AttemptOutcome;
}

export const EVIDENCE_FRESHNESS = Object.freeze(['current', 'stale', 'missing'] as const);

export type EvidenceFreshness = (typeof EVIDENCE_FRESHNESS)[number];

export type SessionActivity =
  | { readonly state: Exclude<SessionActivityState, 'worker-unreachable'> }
  | { readonly state: 'worker-unreachable'; readonly lastContactAt: Instant };

export interface StageSummary {
  readonly stageId: StageId;
  readonly origin: StageOrigin;
  readonly state: StageState;
}

// One card per root run (contract section 3.3), keyed by `runId`.
export interface BoardCard {
  readonly runId: WorkflowRunId;
  readonly title: string;
  readonly workType: WorkType;
  readonly framework: Pick<WorkflowRunBinding, 'pluginId' | 'pluginVersion'>;
  readonly column: BoardColumn;
  readonly stage: StageSummary;
  readonly gate?: GateState;
  readonly waitingFor?: CardWait;
  readonly obstacle?: PlacementObstacle;
  readonly end?: TaskEnd;
  readonly session: SessionActivity;
  readonly integration: MergeGateState;
  readonly needsYou: number;
}

// `position` is the event stream position the view reflects, so that live
// updates resume from it; `asOf` is shown when they are lost.
export interface ViewStamp {
  readonly asOf: Instant;
  readonly position: string;
}

export interface Board extends ViewStamp {
  readonly projectId: ProjectId;
  readonly cards: readonly BoardCard[];
  readonly workersOnline: number;
  readonly callerMayAct: boolean;
}

export interface GateView {
  readonly gateId: GateId;
  readonly state: GateState;
  readonly requiredEvidence: EvidenceKind;
  readonly blockReason?: BlockReason;
}

export interface StageView extends StageSummary {
  readonly column: BoardColumn;
  readonly gates: readonly GateView[];
}

export interface TraceLink {
  readonly requirement: NativeReference;
  readonly workItemIds: readonly WorkItemId[];
  readonly attemptIds: readonly AttemptId[];
  readonly evidence: EvidenceFreshness;
}

export interface AdmissionView {
  readonly admissionId: AdmissionId;
  readonly stageId: StageId;
  readonly workItemId?: WorkItemId;
  readonly state: AdmissionState;
  readonly policyRevision: PolicyRevision;
  // The generation the admission's dispatch started, not the task's current.
  readonly dispatchedGeneration?: OwnershipGeneration;
}

export interface DelegationView {
  readonly parentTaskId: TaskId;
  readonly depth: number;
}

// A G2 task of the card's run, or a delegated child of one of them.
export interface TaskView {
  readonly taskId: TaskId;
  // The task's own run: a child run for a delegated task, not the card's key.
  readonly taskRunId: WorkflowRunId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly admission: AdmissionView;
  readonly delegation?: DelegationView;
  readonly session: SessionActivity;
  readonly obstacle?: PlacementObstacle;
  readonly end?: TaskEnd;
}

export interface TaskDetail extends ViewStamp {
  readonly card: BoardCard;
  readonly stages: readonly StageView[];
  readonly traceability: readonly TraceLink[];
  readonly runBinding: WorkflowRunBinding;
  readonly tasks: readonly TaskView[];
}

// A projection, never the authority for a command; a source it cannot read
// fails the query as `unavailable` instead of returning partial data.
export interface BoardReadModel {
  board(projectId: ProjectId): Promise<Result<Board>>;
  taskDetail(projectId: ProjectId, runId: WorkflowRunId): Promise<Result<TaskDetail>>;
}
