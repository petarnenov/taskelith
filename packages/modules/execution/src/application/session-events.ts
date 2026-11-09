import type { Instant } from '@taskelith/kernel';
import { isSameRequestKey, type NativeRequest, type Session, type Turn } from '../domain/session-records.js';
import type { SessionScope } from '../ports/session-scopes.js';
import { projectScope, type UiEvent, type UiEventRecord } from '../ports/ui-events.js';
import { summaryOf, viewOf } from './session-views.js';

// The events of one change of a session (wire contracts section 10): its
// own fields, each new or changed turn and request, and each new entry.
export function sessionEvents(before: Session | undefined, after: Session, card: SessionScope, occurredAt: Instant): readonly UiEvent[] {
  const records: UiEventRecord[] = [
    ...(before === undefined || sessionFieldsChanged(before, after) ? [sessionRecord(after, card)] : []),
    ...changedTurns(before, after).map((turn) => ({ type: 'turn-changed' as const, sessionId: after.id, turn })),
    ...changedRequests(before, after),
    ...after.output.entries
      .filter((entry) => entry.position > (before?.output.lastPosition ?? 0))
      .map((entry) => ({ type: 'output-appended' as const, sessionId: after.id, entry })),
  ];
  const scope = projectScope(card.projectId);
  return Object.freeze(records.map((record) => Object.freeze({ scope, occurredAt, record })));
}

function sessionRecord(session: Session, card: SessionScope): UiEventRecord {
  return { type: 'agent-session-changed', card, session: summaryOf(viewOf(session)) };
}

// Opened, bound, a generation, a stop, or a handoff; not turns or output.
function sessionFieldsChanged(before: Session, after: Session): boolean {
  return JSON.stringify(sessionFields(before)) !== JSON.stringify(sessionFields(after));
}

function sessionFields(session: Session): readonly unknown[] {
  return [session.nativeSessionId ?? null, session.attempts, session.generations, session.limit ?? null, session.handoff ?? null];
}

function changedTurns(before: Session | undefined, after: Session): readonly Turn[] {
  return after.turns.filter((turn) => {
    const earlier = before?.turns.find((candidate) => candidate.id === turn.id);
    return earlier !== turn && JSON.stringify(withoutCommandIds(earlier)) !== JSON.stringify(withoutCommandIds(turn));
  });
}

// A stored command ID changes nothing that a turn's event shows.
function withoutCommandIds(turn: Turn | undefined): Omit<Turn, 'deliveryCommands'> | undefined {
  if (turn === undefined) return undefined;
  const { deliveryCommands: _commands, ...shown } = turn;
  return shown;
}

function changedRequests(before: Session | undefined, after: Session): UiEventRecord[] {
  return after.requests.flatMap((request, index) => {
    const earlier = before?.requests.find((candidate) => isSameRequestKey(candidate.key, request.key));
    if (earlier === request || JSON.stringify(earlier) === JSON.stringify(request)) return [];
    return [requestRecord(after, request, index + 1)];
  });
}

function requestRecord(session: Session, request: NativeRequest, position: number): UiEventRecord {
  return { type: 'native-request-changed', sessionId: session.id, request, position };
}
