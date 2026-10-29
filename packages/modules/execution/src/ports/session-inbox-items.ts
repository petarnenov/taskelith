import type { Instant, Result } from '@taskelith/kernel';
import type { OwnershipGeneration, ProjectId, TaskId } from '@taskelith/sdlc';
import type { AttemptId, PrincipalId, SessionId } from '../domain/identifiers.js';
import type { RequestKey } from '../domain/session-records.js';
import type { NeedsYouItemId, NeedsYouItemState } from './needs-you.js';
import type { SessionScope } from './session-scopes.js';

export const SESSION_ITEM_KINDS = Object.freeze(['permission-request', 'input-request', 'delivery-acknowledgement'] as const);

export type SessionItemKind = (typeof SESSION_ITEM_KINDS)[number];

// The inbox item of one native request and kind, with the bound attempt it
// was opened for (control-plane wire contracts, sections 8 and 8.1).
export type SessionInboxItem = {
  readonly id: NeedsYouItemId;
  readonly kind: SessionItemKind;
  readonly sessionId: SessionId;
  readonly taskId: TaskId;
  readonly request: RequestKey;
  readonly attemptId?: AttemptId;
  readonly attemptGeneration?: OwnershipGeneration;
  readonly createdAt: Instant;
} & NeedsYouItemState;

// An item with the scope of its session, absent without a task lineage.
export interface ScopedInboxItem {
  readonly item: SessionInboxItem;
  readonly scope?: SessionScope;
}

// `add` is `conflict` for a taken ID or a request with an item of the kind;
// `settle` settles an open item, and is `conflict` for any other.
export interface SessionInboxItems {
  find(sessionId: SessionId, kind: SessionItemKind, request: RequestKey): Promise<Result<SessionInboxItem | undefined>>;
  get(id: NeedsYouItemId): Promise<Result<ScopedInboxItem | undefined>>;
  add(item: SessionInboxItem): Promise<Result<void>>;
  settle(item: SessionInboxItem): Promise<Result<void>>;
  // Open items of the project's sessions after `after`, in ID order.
  listOpen(projectId: ProjectId, after: NeedsYouItemId | undefined, limit: number): Promise<Result<readonly ScopedInboxItem[]>>;
}

// That a person saw an uncertain delivery, audited and immutable.
export interface SessionAuditEvent {
  readonly kind: 'session.delivery-acknowledged';
  readonly subject: NeedsYouItemId;
  readonly actor: PrincipalId;
  readonly occurredAt: Instant;
}

export interface SessionAuditRecords {
  append(event: SessionAuditEvent): Promise<Result<void>>;
}
