// A card link marks its history entry with this page load; a reload or a
// direct link has no such mark, and Back from it could leave the app.
const PAGE_LOAD = String(performance.timeOrigin);

export interface BoardEntryState {
  readonly openedFromBoard: string;
}

export const BOARD_ENTRY_STATE: BoardEntryState = { openedFromBoard: PAGE_LOAD };

export function isOpenedFromBoard(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Partial<BoardEntryState>).openedFromBoard === PAGE_LOAD;
}
