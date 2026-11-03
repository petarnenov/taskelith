import type { Instant, Result } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import type { PrincipalId } from '../domain/identifiers.js';
import type { UiEvent, UiEventScope } from './ui-events.js';

// `0` is the position before any event (wire contracts section 10).
export const BEFORE_FIRST_POSITION = 0;

// A change of a principal's access that Access records in the transaction
// of the change; without `projectId`, of its installation role.
export type PrincipalChange =
  | { readonly change: 'roles-changed'; readonly principalId: PrincipalId; readonly projectId?: ProjectId }
  | { readonly change: 'sessions-ended'; readonly principalId: PrincipalId };

// An entry as committed, before the log numbers it.
export type CommittedEntry =
  | { readonly kind: 'event'; readonly event: UiEvent }
  | { readonly kind: 'principal-change'; readonly change: PrincipalChange };

export type LoggedEntry =
  | { readonly kind: 'event'; readonly position: number; readonly event: UiEvent }
  | { readonly kind: 'principal-change'; readonly position: number; readonly change: PrincipalChange };

// The retention floor, the highest position whose entries left the log,
// and the head, the highest position assigned; both `0` at first.
export interface LogBounds {
  readonly floor: number;
  readonly head: number;
}

// What a stream reads: its scope's events and its principal's changes.
export interface StreamFilter {
  readonly scope: UiEventScope;
  readonly principalId?: PrincipalId;
}

// The event log: committed entries get positions from one sequence, never
// reused; an entry follows every entry whose commit its transaction saw.
export interface UiEventLog {
  // Numbers at most `limit` committed entries; answers how many.
  assign(limit: number, numberedAt: Instant): Promise<Result<number>>;
  bounds(): Promise<Result<LogBounds>>;
  // At most `limit` entries of the filter with `after < position <= through`.
  readAfter(after: number, through: number, filter: StreamFilter, limit: number): Promise<Result<readonly LoggedEntry[]>>;
  // Removes at most `limit` entries numbered before `before`, oldest first,
  // and raises the floor to the highest removed; answers the floor.
  prune(before: Instant, limit: number): Promise<Result<number>>;
}

