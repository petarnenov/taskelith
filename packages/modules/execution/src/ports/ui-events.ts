import type { Instant, Result } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import type { SessionId } from '../domain/identifiers.js';
import type { NativeRequest, OutputEntry, Session, Turn } from '../domain/session-records.js';
import type { BoardCard } from './board-read-model.js';
import type { NeedsYouItem } from './needs-you.js';
import type { SessionScope } from './session-scopes.js';

// Which stream carries an event: one project's, or the installation's.
export type UiEventScope =
  | { readonly kind: 'project'; readonly projectId: ProjectId }
  | { readonly kind: 'installation' };

// A session as `agent-session-changed` carries it: its output window's
// bounds and the counts of its turns and requests, not their records.
export type SessionSummary = Omit<Session, 'turns' | 'requests' | 'output'> & {
  readonly turnCount: number;
  readonly requestCount: number;
  readonly outputWindow: { readonly lastPosition: number; readonly earliestRetained?: number };
};

// The records of the events of wire contracts section 10, as the module
// holds them; the control plane maps each to its wire schema.
export type UiEventRecord =
  | { readonly type: 'board-changed'; readonly workersOnline: number }
  | { readonly type: 'card-changed'; readonly card: BoardCard }
  | { readonly type: 'inbox-item-changed'; readonly item: NeedsYouItem }
  | { readonly type: 'agent-session-changed'; readonly card: SessionScope; readonly session: SessionSummary }
  | { readonly type: 'turn-changed'; readonly sessionId: SessionId; readonly turn: Turn }
  // `position` is the request's place in recording order, from 1.
  | { readonly type: 'native-request-changed'; readonly sessionId: SessionId; readonly request: NativeRequest; readonly position: number }
  | { readonly type: 'output-appended'; readonly sessionId: SessionId; readonly entry: OutputEntry };

export type UiEventType = UiEventRecord['type'];

export interface UiEvent {
  readonly scope: UiEventScope;
  readonly occurredAt: Instant;
  readonly record: UiEventRecord;
}

// The publishing port of a transaction: an appended event is committed or
// rolled back with the change it reports, and gets its position later.
export interface UiEventOutbox {
  append(event: UiEvent): Promise<Result<void>>;
}

export function projectScope(projectId: ProjectId): UiEventScope {
  return Object.freeze({ kind: 'project', projectId });
}

export const INSTALLATION_SCOPE: UiEventScope = Object.freeze({ kind: 'installation' });
