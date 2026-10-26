import type { Instant, Result } from '@taskelith/kernel';
import type {
  AdmissionId,
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
import type { AttemptId } from '../domain/identifiers.js';

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

export const WORK_TYPES = Object.freeze([
  'feature',
  'bug',
  'improvement',
  'documentation',
  'maintenance',
  'emergency',
] as const);

export type WorkType = (typeof WORK_TYPES)[number];

// The view's own merge gate values; Integrations' merge request states map
// onto them (product ports contract section 3.4).
export const MERGE_GATE_STATES = Object.freeze([
  'not-ready',
  'awaiting-manual-merge',
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

export const WAITING_REASONS = Object.freeze([
  'person',
  'stage-admission',
  'reviewer',
  'capacity',
  'merge-queue',
] as const);

export type WaitingReason = (typeof WAITING_REASONS)[number];

export const EVIDENCE_FRESHNESS = Object.freeze(['current', 'stale', 'missing'] as const);

export type EvidenceFreshness = (typeof EVIDENCE_FRESHNESS)[number];

export type SessionActivity =
  | { readonly state: Exclude<SessionActivityState, 'worker-unreachable'> }
  | { readonly state: 'worker-unreachable'; readonly lastContactAt: Instant };

export interface CurrentStage {
  readonly stageId: StageId;
  readonly origin: StageOrigin;
  readonly state: StageState;
}

export interface BoardCard {
  readonly taskId: TaskId;
  readonly runId: WorkflowRunId;
  readonly title: string;
  readonly workType: WorkType;
  readonly framework: Pick<WorkflowRunBinding, 'pluginId' | 'pluginVersion'>;
  readonly column: BoardColumn;
  readonly stage: CurrentStage;
  readonly gate?: GateState;
  readonly waitingFor?: WaitingReason;
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

export interface StageView extends CurrentStage {
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
  readonly state: AdmissionState;
  readonly policyRevision: PolicyRevision;
}

export interface TaskDetail extends ViewStamp {
  readonly card: BoardCard;
  readonly stages: readonly StageView[];
  readonly traceability: readonly TraceLink[];
  readonly runBinding: WorkflowRunBinding;
  readonly admission: AdmissionView;
}

// A projection, never the authority for a command; a source it cannot read
// fails the query as `unavailable` instead of returning partial data.
export interface BoardReadModel {
  board(projectId: ProjectId): Promise<Result<Board>>;
  taskDetail(projectId: ProjectId, taskId: TaskId): Promise<Result<TaskDetail>>;
}
