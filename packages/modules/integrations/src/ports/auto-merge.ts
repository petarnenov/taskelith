import type { Identifier, Instant, Result } from '@taskelith/kernel';
import type { PrincipalId } from '@taskelith/execution';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';

export type MergeRequestId = Identifier<'MergeRequestId'>;
export type BranchName = Identifier<'BranchName'>;
export type CodeHead = Identifier<'CodeHead'>;
export type IntegratedRevision = Identifier<'IntegratedRevision'>;

declare const revisionBrand: unique symbol;

// The version of a setting or merge request that compare-and-set compares.
export type Revision = number & { readonly [revisionBrand]: true };

export const AUTO_MERGE_DEFAULT_ENABLED = true;

export const CONFLICT_ATTEMPT_BUDGET = 3;

export const MERGE_REQUEST_STATES = Object.freeze([
  'queued',
  'merging',
  'resolving-conflict',
  'returned-to-specify',
  'escalated',
  'merged',
  'withdrawn',
] as const);

export type MergeRequestState = (typeof MERGE_REQUEST_STATES)[number];

// At most one request per target branch is in one of these states.
export const IN_FLIGHT_MERGE_STATES = Object.freeze(['merging', 'resolving-conflict'] as const);

export const WITHDRAWAL_REASONS = Object.freeze([
  'gate-not-passed',
  'auto-merge-off',
  'cancelled',
  'manual-merge',
  'maintainer-withdrew',
] as const);

export type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];

export interface AutoMergeSetting {
  readonly projectId: ProjectId;
  readonly enabled: boolean;
  readonly revision: Revision;
  readonly lastChange?: SettingChange;
}

export interface SettingChange {
  readonly changedBy: PrincipalId;
  readonly changedAt: Instant;
}

export interface AutoMergeChange {
  readonly projectId: ProjectId;
  readonly enabled: boolean;
  readonly expectedRevision: Revision;
  readonly changedBy: PrincipalId;
}

// Changed only by a project-maintainer, by compare-and-set; the change records
// or revokes the push standing rule in the same transaction.
export interface AutoMergeSettings {
  get(projectId: ProjectId): Promise<Result<AutoMergeSetting>>;
  change(change: AutoMergeChange): Promise<Result<AutoMergeSetting>>;
}

export interface MergeRequest {
  readonly id: MergeRequestId;
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
  readonly taskId: TaskId;
  readonly targetBranch: BranchName;
  readonly head: CodeHead;
  readonly state: MergeRequestState;
  readonly revision: Revision;
  readonly conflictAttempts: number;
  readonly enqueuedAt: Instant;
  readonly withdrawalReason?: WithdrawalReason;
  readonly integratedRevision?: IntegratedRevision;
}

export interface MergeEnqueue {
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
  readonly taskId: TaskId;
  readonly targetBranch: BranchName;
  readonly head: CodeHead;
}

export type MergeTransition =
  | { readonly to: 'queued' | 'merging' | 'resolving-conflict' | 'returned-to-specify' | 'escalated' }
  | { readonly to: 'merged'; readonly integratedRevision: IntegratedRevision }
  | { readonly to: 'withdrawn'; readonly reason: WithdrawalReason };

export type MergeClaim =
  | { readonly outcome: 'claimed'; readonly request: MergeRequest }
  | { readonly outcome: 'branch-busy' | 'queue-empty' };

export interface ManualMerge {
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
  readonly taskId: TaskId;
  readonly targetBranch: BranchName;
  readonly head: CodeHead;
  readonly integratedRevision: IntegratedRevision;
}

// Serial per target branch; enqueueing is idempotent per run and head, and
// every transition compares the revision. `latestForRun` may be `not-found`.
export interface MergeQueue {
  enqueue(request: MergeEnqueue): Promise<Result<MergeRequest>>;
  claimNext(projectId: ProjectId, targetBranch: BranchName): Promise<Result<MergeClaim>>;
  transition(id: MergeRequestId, expectedRevision: Revision, change: MergeTransition): Promise<Result<MergeRequest>>;
  latestForRun(runId: WorkflowRunId): Promise<Result<MergeRequest>>;
  recordManualMerge(merge: ManualMerge): Promise<Result<MergeRequest>>;
}
