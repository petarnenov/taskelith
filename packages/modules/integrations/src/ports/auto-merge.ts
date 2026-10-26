import type { Identifier, Instant, Result } from '@taskelith/kernel';
import type { IdempotencyKey, PrincipalId } from '@taskelith/execution';
import type { Generation, ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';

export type MergeRequestId = Identifier<'MergeRequestId'>;
export type BranchName = Identifier<'BranchName'>;
export type CodeHead = Identifier<'CodeHead'>;
export type IntegratedRevision = Identifier<'IntegratedRevision'>;

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

export const WITHDRAWAL_REASONS = Object.freeze(['gate-not-passed', 'auto-merge-off', 'cancelled'] as const);

export type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];

export interface AutoMergeSetting {
  readonly projectId: ProjectId;
  readonly enabled: boolean;
  readonly revision: Generation;
  readonly changedBy?: PrincipalId;
  readonly changedAt?: Instant;
}

export interface AutoMergeChange {
  readonly projectId: ProjectId;
  readonly enabled: boolean;
  readonly expectedRevision: Generation;
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
  readonly revision: Generation;
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
  readonly idempotencyKey: IdempotencyKey;
}

export type MergeTransition =
  | { readonly to: 'merging' | 'resolving-conflict' | 'returned-to-specify' | 'escalated' }
  | { readonly to: 'merged'; readonly integratedRevision: IntegratedRevision }
  | { readonly to: 'withdrawn'; readonly reason: WithdrawalReason };

// Serial per target branch: `claimNext` returns nothing while a request of
// that branch is in flight; every transition compares the revision.
export interface MergeQueue {
  enqueue(request: MergeEnqueue): Promise<Result<MergeRequest>>;
  claimNext(projectId: ProjectId, targetBranch: BranchName): Promise<Result<MergeRequest | undefined>>;
  transition(id: MergeRequestId, expectedRevision: Generation, change: MergeTransition): Promise<Result<MergeRequest>>;
  forRun(runId: WorkflowRunId): Promise<Result<MergeRequest | undefined>>;
}
