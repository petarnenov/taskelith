import type { Identifier, Instant, Result } from '@taskelith/kernel';
import type { GateId, OwnershipGeneration, ProjectId, StageId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import type { AttemptId, IdempotencyKey, NativeRequestId, PrincipalId } from '../domain/identifiers.js';
import type { ViewStamp } from './board-read-model.js';

export type NeedsYouItemId = Identifier<'NeedsYouItemId'>;
export type NeedsYouSourceId = Identifier<'NeedsYouSourceId'>;

export const NEEDS_YOU_KINDS = Object.freeze([
  'permission-request',
  'input-request',
  'spec-approval',
  'escalation',
] as const);

export type NeedsYouKind = (typeof NEEDS_YOU_KINDS)[number];

export const ESCALATION_REASONS = Object.freeze([
  'conflict-budget-spent',
  'spec-reconciliation-failed',
  'no-reviewer',
] as const);

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ANSWERING_ROLES = Object.freeze(['project-operator', 'project-maintainer'] as const);

export type AnsweringRole = (typeof ANSWERING_ROLES)[number];

export const MAX_INPUT_ANSWER_BYTES = 64 * 1024;

export interface NeedsYouSubject {
  readonly taskId: TaskId;
  readonly runId?: WorkflowRunId;
  readonly stageId?: StageId;
  readonly gateId?: GateId;
  readonly attemptId?: AttemptId;
  readonly attemptGeneration?: OwnershipGeneration;
  readonly nativeRequestId?: NativeRequestId;
}

export type NeedsYouAnswer =
  | { readonly kind: 'permission-request'; readonly decision: 'allow' | 'deny' }
  | { readonly kind: 'input-request'; readonly text: string }
  | { readonly kind: 'spec-approval'; readonly decision: 'approve' | 'reject'; readonly reason: string }
  | {
      readonly kind: 'escalation';
      readonly decision: 'retry' | 'return-to-specify' | 'merge-manually' | 'withdraw';
    };

export interface NeedsYouResolution {
  readonly resolvedBy: PrincipalId;
  readonly resolvedAt: Instant;
  readonly answer: NeedsYouAnswer;
}

interface NeedsYouItemFields {
  readonly id: NeedsYouItemId;
  readonly projectId: ProjectId;
  readonly sourceId: NeedsYouSourceId;
  readonly subject: NeedsYouSubject;
  readonly title: string;
  readonly createdAt: Instant;
  readonly answerableBy: AnsweringRole;
}

export type NeedsYouItemState =
  | { readonly state: 'open' }
  | { readonly state: 'resolved'; readonly resolution: NeedsYouResolution };

export type NeedsYouItem = NeedsYouItemFields &
  NeedsYouItemState &
  (
    | { readonly kind: Exclude<NeedsYouKind, 'escalation'> }
    | { readonly kind: 'escalation'; readonly escalationReason: EscalationReason }
  );

export interface AnswerRequest {
  readonly itemId: NeedsYouItemId;
  readonly responder: PrincipalId;
  readonly answer: NeedsYouAnswer;
  readonly idempotencyKey: IdempotencyKey;
}

export interface SourcePage {
  readonly items: readonly NeedsYouItem[];
  readonly position: string;
}

// One source of items; it persists a native request before listing it, and
// consumes an answer once, rejecting a duplicate or a newer generation.
export interface NeedsYouSource {
  readonly id: NeedsYouSourceId;
  readonly kinds: readonly NeedsYouKind[];
  openItems(projectId: ProjectId, after?: string): Promise<Result<SourcePage>>;
  answer(request: AnswerRequest): Promise<Result<NeedsYouItem>>;
}

export interface NeedsYouFilter {
  readonly kind?: NeedsYouKind;
  readonly taskId?: TaskId;
}

export interface NeedsYouList extends ViewStamp {
  readonly items: readonly NeedsYouItem[];
}

export interface TaskCount {
  readonly taskId: TaskId;
  readonly count: number;
}

export interface NeedsYouCounts extends ViewStamp {
  readonly total: number;
  readonly byTask: readonly TaskCount[];
}

// Open items newest first, aggregated over every source; it never answers an
// item itself, and is distinct from the consumer message `Inbox`.
export interface NeedsYouInbox {
  open(projectId: ProjectId, filter?: NeedsYouFilter): Promise<Result<NeedsYouList>>;
  counts(projectId: ProjectId): Promise<Result<NeedsYouCounts>>;
}
