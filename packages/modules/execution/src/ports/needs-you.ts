import type { Identifier, Instant, Result } from '@taskelith/kernel';
import type {
  EvidenceReference,
  GateId,
  OwnershipGeneration,
  ProjectId,
  StageId,
  TaskId,
  WorkflowRunId,
} from '@taskelith/sdlc';
import type { ExecutionEvidence } from '../domain/execution.js';
import type {
  AttemptId,
  ExecutionId,
  IdempotencyKey,
  NativeRequestId,
  PrincipalId,
  SessionGeneration,
  SessionId,
  WorkerId,
} from '../domain/identifiers.js';
import type { JournalId, ObservationId } from '../domain/observation-sequence.js';
import type { ViewStamp } from './board-read-model.js';

export type NeedsYouItemId = Identifier<'NeedsYouItemId'>;
export type NeedsYouSourceId = Identifier<'NeedsYouSourceId'>;

export const NEEDS_YOU_KINDS = Object.freeze([
  'permission-request',
  'input-request',
  'spec-approval',
  'escalation',
  'reconciliation',
  'delivery-acknowledgement',
] as const);

export type NeedsYouKind = (typeof NEEDS_YOU_KINDS)[number];

export const ESCALATION_REASONS = Object.freeze([
  'conflict-budget-spent',
  'spec-reconciliation-failed',
  'no-reviewer',
] as const);

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const RECONCILIATION_REASONS = Object.freeze(['unknown-execution', 'unrecorded-process'] as const);

export type ReconciliationReason = (typeof RECONCILIATION_REASONS)[number];

export const ANSWERING_ROLES = Object.freeze([
  'project-operator',
  'project-maintainer',
  'installation-owner',
] as const);

export type AnsweringRole = (typeof ANSWERING_ROLES)[number];

export const MAX_INPUT_ANSWER_BYTES = 64 * 1024;

// Where an item and its inbox belong (contract section 4.1).
export type NeedsYouScope =
  | { readonly kind: 'project'; readonly projectId: ProjectId }
  | { readonly kind: 'installation' };

// An item about a card: `runId` is the card's key, `taskId` a G2 task.
export interface CardSubject {
  readonly scope: 'card';
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
  readonly taskId?: TaskId;
  readonly stageId?: StageId;
  readonly gateId?: GateId;
  readonly attemptId?: AttemptId;
  readonly attemptGeneration?: OwnershipGeneration;
  readonly executionId?: ExecutionId;
  // With the generation and ID, the request; an ID alone can be reused.
  readonly sessionId?: SessionId;
  readonly sessionGeneration?: SessionGeneration;
  readonly nativeRequestId?: NativeRequestId;
}

// A worker's process that no journal record names, outside any project.
export interface WorkerProcessSubject {
  readonly scope: 'installation';
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly observationId: ObservationId;
}

export type NeedsYouSubject = CardSubject | WorkerProcessSubject;

export type NeedsYouAnswer =
  | { readonly kind: 'permission-request'; readonly decision: 'allow' | 'deny' }
  | { readonly kind: 'input-request'; readonly text: string }
  | { readonly kind: 'spec-approval'; readonly decision: 'approve' | 'reject'; readonly reason: string }
  | {
      readonly kind: 'escalation';
      readonly decision: 'retry' | 'return-to-specify' | 'merge-manually' | 'withdraw';
    }
  | {
      readonly kind: 'reconciliation';
      readonly decision: 'resolve-execution' | 'acknowledge-process';
      readonly evidence: EvidenceReference;
      readonly reason: string;
    }
  // Records that a person saw an uncertain delivery; it resends nothing.
  | { readonly kind: 'delivery-acknowledgement'; readonly decision: 'acknowledge' };

export interface NeedsYouResolution {
  readonly resolvedBy: PrincipalId;
  readonly resolvedAt: Instant;
  readonly answer: NeedsYouAnswer;
}

interface NeedsYouItemFields {
  readonly id: NeedsYouItemId;
  readonly sourceId: NeedsYouSourceId;
  readonly subject: NeedsYouSubject;
  readonly title: string;
  readonly createdAt: Instant;
  readonly answerableBy: AnsweringRole;
}

// `closed`: its subject stopped waiting on a person without an answer.
export type NeedsYouItemState =
  | { readonly state: 'open' }
  | { readonly state: 'resolved'; readonly resolution: NeedsYouResolution }
  | { readonly state: 'closed'; readonly closedAt: Instant };

type AnswerOnlyKind = Exclude<NeedsYouKind, 'escalation' | 'reconciliation'>;

export type NeedsYouItem = NeedsYouItemFields &
  NeedsYouItemState &
  (
    | { readonly kind: AnswerOnlyKind }
    | { readonly kind: 'escalation'; readonly escalationReason: EscalationReason }
    | {
        readonly kind: 'reconciliation';
        readonly reconciliationReason: 'unknown-execution';
        readonly observed: readonly ExecutionEvidence[];
      }
    | {
        readonly kind: 'reconciliation';
        readonly reconciliationReason: 'unrecorded-process';
        readonly containment: string;
        readonly processCount: number;
      }
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
  openItems(scope: NeedsYouScope, after?: string): Promise<Result<SourcePage>>;
  answer(request: AnswerRequest): Promise<Result<NeedsYouItem>>;
}

export interface NeedsYouFilter {
  readonly kind?: NeedsYouKind;
  readonly runId?: WorkflowRunId;
}

export interface NeedsYouList extends ViewStamp {
  readonly items: readonly NeedsYouItem[];
}

export interface CardCount {
  readonly runId: WorkflowRunId;
  readonly count: number;
}

// `byCard` is empty for the installation scope.
export interface NeedsYouCounts extends ViewStamp {
  readonly total: number;
  readonly byCard: readonly CardCount[];
}

// Open items newest first, aggregated over every source; it never answers an
// item itself, and is distinct from the consumer message `Inbox`.
export interface NeedsYouInbox {
  open(scope: NeedsYouScope, filter?: NeedsYouFilter): Promise<Result<NeedsYouList>>;
  counts(scope: NeedsYouScope): Promise<Result<NeedsYouCounts>>;
}
