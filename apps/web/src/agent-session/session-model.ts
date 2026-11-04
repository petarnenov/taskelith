import type { AgentSession, AgentSessionView, BoardCard, StreamChange, Turn, TurnPage } from '../board/board';
import { isAfter, later } from '../board/board-model';

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
  readonly freshness: Freshness;
}

// The position of the read or event that supplied each record (wire
// contracts section 10): the session's, and each turn's by identifier.
export interface Freshness {
  readonly session: string;
  readonly turns: Readonly<Record<string, string>>;
}

// The session read and the turn pages above the window's cursor, at the
// lowest position and earliest time among them (wire contracts section 10).
export function viewOf(view: AgentSessionView, pages: readonly TurnPage[], before: number): SessionTimelineView {
  let { position, asOf: knownAt } = view;
  let turns: Readonly<Record<string, string>> = {};
  for (const page of pages) {
    if (isAfter(position, page.position)) position = page.position;
    if (Date.parse(page.asOf) < Date.parse(knownAt)) knownAt = page.asOf;
    turns = withTurnsAt(turns, page.turns, page.position);
  }
  const freshness = { session: view.position, turns };
  return { session: view.session, turns: inOrder(pages.flatMap((page) => page.turns)), before, position, knownAt, freshness };
}

// An event not above the view's position, or not above the read that
// supplied its record, is already in it; another session's or card's is not.
export function applySessionChange(view: SessionTimelineView, change: StreamChange): SessionTimelineView {
  if (change.kind === 'board-changed' || !isAfter(change.position, view.position)) return view;
  const { session, freshness } = view;
  const stamp = { position: change.position, knownAt: later(view.knownAt, change.occurredAt) };
  if (change.kind === 'turn-changed') {
    if (change.sessionId !== session.sessionId || !isFresher(change.position, freshness.turns[change.turn.turnId])) return view;
    const turns = withTurnsAt(freshness.turns, [change.turn], change.position);
    return { ...view, ...stamp, turns: withTurn(view.turns, change.turn), freshness: { ...freshness, turns } };
  }
  if (change.kind === 'agent-session-changed') {
    if (change.session.sessionId !== session.sessionId || !isAfter(change.position, freshness.session)) return view;
    return { ...view, ...stamp, session: change.session, freshness: { ...freshness, session: change.position } };
  }
  return change.card.runId === session.runId ? { ...view, ...stamp, card: change.card } : view;
}

// Turns of an earlier window join the known ones; a known turn takes the
// page's state only when the page was read above what supplied the turn.
export function withEarlierTurns(view: SessionTimelineView, pages: readonly TurnPage[], before: number): SessionTimelineView {
  let { turns } = view;
  let known = view.freshness.turns;
  for (const page of pages) {
    const fresher = page.turns.filter((turn) => isFresher(page.position, known[turn.turnId]));
    turns = fresher.reduce(withTurn, turns);
    known = withTurnsAt(known, fresher, page.position);
  }
  return { ...view, turns, before, freshness: { ...view.freshness, turns: known } };
}

function isFresher(position: string, than: string | undefined): boolean {
  return than === undefined || isAfter(position, than);
}

function withTurnsAt(known: Readonly<Record<string, string>>, turns: readonly Turn[], position: string): Record<string, string> {
  const next = { ...known };
  for (const turn of turns) next[turn.turnId] = position;
  return next;
}

function withTurn(turns: readonly Turn[], turn: Turn): Turn[] {
  const at = turns.findIndex((known) => known.turnId === turn.turnId);
  if (at === -1) return inOrder([...turns, turn]);
  return turns.map((known, index) => (index === at ? turn : known));
}

function inOrder(turns: readonly Turn[]): Turn[] {
  return [...turns].sort((first, second) => first.position - second.position);
}
