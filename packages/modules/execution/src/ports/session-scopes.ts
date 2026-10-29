import type { Result } from '@taskelith/kernel';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import type { SessionId } from '../domain/identifiers.js';

// Where a session belongs: the project of its task and the card, the run of
// its task's lineage root (product ports, section 3.3).
export interface SessionScope {
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
}

// The scope of sessions through Scheduling's task lineage; a session whose
// task has no lineage has no scope.
export interface SessionScopes {
  scopeOf(sessionId: SessionId): Promise<Result<SessionScope | undefined>>;
  // Whether the run is a card of the project: a root run, never a child.
  isCard(projectId: ProjectId, runId: WorkflowRunId): Promise<Result<boolean>>;
  // The card's sessions after `after`, in session ID code-unit order.
  listByCard(scope: SessionScope, after: SessionId | undefined, limit: number): Promise<Result<readonly SessionId[]>>;
}

// The event stream position a view reflects; item 14 assigns positions,
// and until then every view is before any event (coordinator answer Q2).
export interface ViewPositions {
  current(): Promise<Result<string>>;
}
