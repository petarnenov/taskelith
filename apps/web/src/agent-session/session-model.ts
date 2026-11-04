import type { AgentSession, AgentSessionView, BoardCard, StreamChange, Turn, TurnPage } from '../board/board';
import { isAfter } from '../board/board-model';

// The session, its read turns in position order, the count of earlier
// ones, the run's card the stream last showed, and the lowest read position.
export interface SessionTimelineView {
  readonly session: AgentSession;
  readonly turns: readonly Turn[];
  // The turns before the earliest window read: the cursor for an earlier read.
  readonly before: number;
  readonly card?: BoardCard;
  readonly position: string;
  readonly knownAt: string;
}

// The session read and the turn pages above the window's cursor, at the
// lowest position and earliest time among them (wire contracts section 10).
export function viewOf(view: AgentSessionView, pages: readonly TurnPage[], before: number): SessionTimelineView {
  let { position, asOf: knownAt } = view;
  for (const page of pages) {
    if (isAfter(position, page.position)) position = page.position;
    if (Date.parse(page.asOf) < Date.parse(knownAt)) knownAt = page.asOf;
  }
  const turns = pages.flatMap((page) => page.turns);
  return { session: view.session, turns: inOrder(turns), before, position, knownAt };
}

// An event not above the view's position is already in it; one of another
// session or card leaves the view as it is, so nothing is shown again.
export function applySessionChange(view: SessionTimelineView, change: StreamChange): SessionTimelineView {
  if (change.kind === 'board-changed' || !isAfter(change.position, view.position)) return view;
  const { session } = view;
  const stamp = { position: change.position, knownAt: change.occurredAt };
  if (change.kind === 'turn-changed') {
    if (change.sessionId !== session.sessionId) return view;
    return { ...view, ...stamp, turns: withTurn(view.turns, change.turn) };
  }
  if (change.kind === 'agent-session-changed') {
    if (change.session.sessionId !== session.sessionId) return view;
    return { ...view, ...stamp, session: change.session };
  }
  return change.card.runId === session.runId ? { ...view, ...stamp, card: change.card } : view;
}

// Turns of an earlier window join the known ones; a turn the stream already
// showed keeps its newer state, and the cursor moves down to the window's.
export function withEarlierTurns(view: SessionTimelineView, page: TurnPage, before: number): SessionTimelineView {
  const known = new Set(view.turns.map((turn) => turn.turnId));
  const earlier = page.turns.filter((turn) => !known.has(turn.turnId));
  return { ...view, turns: inOrder([...view.turns, ...earlier]), before };
}

function withTurn(turns: readonly Turn[], turn: Turn): Turn[] {
  const at = turns.findIndex((known) => known.turnId === turn.turnId);
  if (at === -1) return inOrder([...turns, turn]);
  return turns.map((known, index) => (index === at ? turn : known));
}

function inOrder(turns: readonly Turn[]): Turn[] {
  return [...turns].sort((first, second) => first.position - second.position);
}
