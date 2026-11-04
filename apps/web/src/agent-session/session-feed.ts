import type { BoardGateway, ReadFailed, ReadResult, TurnPage } from '../board/board';
import { startLiveFeed, type ShownView } from '../board/live-feed';
import type { Clock } from '../session/clock';
import { applySessionChange, viewOf, withEarlierTurns, type SessionTimelineView } from './session-model';

// The last turns read on open and each earlier read: the control plane's
// page, so one read answers one window.
export const TURN_WINDOW = 100;

// A server that names new cursors beyond this many pages reads as unreachable.
export const MAX_TURN_PAGES = 100;

// ready: an earlier window may be read; reading: one is; failed: the last
// read got no answer, which shows why, and a retry reads it again.
export type EarlierRead =
  | { readonly status: 'ready' }
  | { readonly status: 'reading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed };

const READY: EarlierRead = { status: 'ready' };
const READING: EarlierRead = { status: 'reading' };

export type SessionFeedState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | ShownSession;

export interface ShownSession extends ShownView<SessionTimelineView> {
  readonly earlier: EarlierRead;
}

export interface SessionFeed {
  // Reads the window of turns before the shown ones, while any remain.
  readonly loadEarlier: () => void;
  readonly stop: () => void;
}

interface SessionFeedOptions {
  readonly projectId: string;
  readonly sessionId: string;
  readonly gateway: BoardGateway;
  readonly clock: Clock;
  readonly show: (state: SessionFeedState) => void;
}

// Reads the session and its last window of turns, then follows the
// project's event stream through the shared live feed.
export function startSessionFeed({ projectId, sessionId, gateway, clock, show }: SessionFeedOptions): SessionFeed {
  let stopped = false;
  let shown: ShownView<SessionTimelineView> | undefined;
  let earlier: EarlierRead = READY;

  function showSession(): void {
    if (shown !== undefined) show({ ...shown, earlier });
  }

  async function read(): Promise<ReadResult<SessionTimelineView>> {
    const session = await gateway.readAgentSession(projectId, sessionId);
    if (session.kind !== 'read') return session;
    const before = Math.max(0, session.value.session.lastTurnPosition - TURN_WINDOW);
    const pages = await readTurnPages(before, Number.POSITIVE_INFINITY);
    if (pages.kind !== 'read') return pages;
    return { kind: 'read', value: viewOf(session.value, pages.value, before) };
  }

  // The pages above the cursor, each short of 100 turns followed by its
  // next cursor until it reaches `until`: a window, or every later turn.
  async function readTurnPages(after: number, until: number): Promise<ReadResult<readonly TurnPage[]>> {
    const pages: TurnPage[] = [];
    let cursor = after;
    do {
      const page = await gateway.listAgentSessionTurns(projectId, sessionId, cursor);
      if (page.kind !== 'read') return page;
      pages.push(page.value);
      if (page.value.next === undefined || page.value.next >= until) return { kind: 'read', value: pages };
      if (page.value.next <= cursor || pages.length >= MAX_TURN_PAGES) return { kind: 'unavailable' };
      cursor = page.value.next;
    } while (true);
  }

  const feed = startLiveFeed<SessionTimelineView>({
    source: { read, positionOf: (view) => view.position, apply: applySessionChange },
    openEvents: (after, listener) => gateway.openEvents(projectId, after, listener),
    clock,
    show: (state) => {
      if (state.status !== 'shown') {
        shown = undefined;
        show(state);
        return;
      }
      // A new snapshot shows the last window again, so an earlier read
      // that was running or failed no longer applies to it.
      if (state.snapshot !== shown?.snapshot) earlier = READY;
      shown = state;
      showSession();
    },
  });

  function loadEarlier(): void {
    if (stopped || shown === undefined || earlier.status === 'reading' || shown.view.before === 0) return;
    const { snapshot } = shown;
    const { before } = shown.view;
    const after = Math.max(0, before - TURN_WINDOW);
    earlier = READING;
    showSession();
    void readTurnPages(after, before).then((pages) => {
      if (stopped || shown?.snapshot !== snapshot) return;
      if (pages.kind !== 'read') {
        earlier = { status: 'failed', failure: pages };
        showSession();
        return;
      }
      earlier = READY;
      feed.amend((view) => withEarlierTurns(view, pages.value, after));
    });
  }

  return {
    loadEarlier,
    stop: () => {
      stopped = true;
      feed.stop();
    },
  };
}
