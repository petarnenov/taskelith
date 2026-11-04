import type { Board, BoardCard, BoardChange, BoardColumn, StreamChange } from './board';

// A board snapshot with the events applied since, and the time of the last
// state the SPA knows: the snapshot's asOf or a later event's occurredAt.
export interface BoardView {
  readonly board: Board;
  readonly knownAt: string;
}

export function viewOf(board: Board): BoardView {
  return { board, knownAt: board.asOf };
}

// Wire contracts section 10: an event not above the view's position is
// already in it, so it is skipped; a session event changes no board.
export function applyChange(view: BoardView, change: StreamChange): BoardView {
  const { board } = view;
  if (!isBoardChange(change) || !isAfter(change.position, board.position)) return view;
  const knownAt = later(view.knownAt, change.occurredAt);
  const next = { ...board, position: change.position };
  if (change.kind === 'board-changed') return { board: { ...next, workersOnline: change.workersOnline }, knownAt };
  return { board: { ...next, cards: withCard(board.cards, change.card) }, knownAt };
}

function isBoardChange(change: StreamChange): change is BoardChange {
  return change.kind === 'card-changed' || change.kind === 'board-changed';
}

export function cardsIn(board: Board, column: BoardColumn): BoardCard[] {
  return board.cards.filter((card) => card.column === column);
}

// Product ports section 3.4: a card at Close stays in Review and shows
// its merge gate state there until it merges.
export function cardsAtMergeGate(board: Board): BoardCard[] {
  return cardsIn(board, 'review').filter((card) => card.integration !== 'not-ready');
}

// Positions are decimal integers of up to 16 digits, beyond a safe number.
export function isAfter(position: string, than: string): boolean {
  return BigInt(position) > BigInt(than);
}

function withCard(cards: readonly BoardCard[], card: BoardCard): BoardCard[] {
  const at = cards.findIndex((known) => known.runId === card.runId);
  if (at === -1) return [...cards, card];
  return cards.map((known, index) => (index === at ? card : known));
}

export function later(first: string, second: string): string {
  return Date.parse(second) > Date.parse(first) ? second : first;
}
