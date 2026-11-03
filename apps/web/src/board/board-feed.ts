import type { Clock } from '../session/clock';
import type { BoardChange, BoardGateway, BoardStreamEvent, ReadFailure } from './board';
import { applyChange, viewOf, type BoardView } from './board-model';

// connecting: before the stream first opens or while it is opened anew;
// lost: the stream dropped, and the board shows its last known state.
export type Liveness = 'connecting' | 'live' | 'lost';

export type BoardFeedState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailure }
  | { readonly status: 'shown'; readonly view: BoardView; readonly liveness: Liveness };

// After a stream that closed for good, the board waits this long before it
// opens a new one, so a stream that keeps failing is not opened in a loop.
export const STREAM_RETRY_MILLISECONDS = 10_000;

interface BoardFeedOptions {
  readonly projectId: string;
  readonly gateway: BoardGateway;
  readonly clock: Clock;
  readonly show: (state: BoardFeedState) => void;
}

// Reads the board, then follows its event stream from the snapshot's
// position; returns the function that stops it.
export function startBoardFeed({ projectId, gateway, clock, show }: BoardFeedOptions): () => void {
  let stopped = false;
  let view: BoardView | undefined;
  let liveness: Liveness = 'connecting';
  let reads = 0;
  // Changes that arrive while a read runs, applied over its snapshot.
  let sinceRead: BoardChange[] = [];
  let closeStream = () => {};
  let cancelRetry = () => {};

  const showView = () => {
    if (view !== undefined) show({ status: 'shown', view, liveness });
  };

  async function read(): Promise<boolean> {
    const thisRead = (reads += 1);
    sinceRead = [];
    const result = await gateway.readBoard(projectId);
    if (stopped || thisRead !== reads) return false;
    if (result.kind !== 'read') {
      closeStream();
      view = undefined;
      show({ status: 'failed', failure: result.kind });
      return false;
    }
    view = sinceRead.reduce(applyChange, viewOf(result.value));
    showView();
    return true;
  }

  function open(): void {
    if (stopped || view === undefined) return;
    closeStream();
    liveness = 'connecting';
    showView();
    closeStream = gateway.openEvents(projectId, view.board.position, receive);
  }

  function readThenOpen(delay: number): void {
    void read().then((read) => {
      if (!read) return;
      if (delay === 0) open();
      else cancelRetry = clock.schedule(delay, open);
    });
  }

  function setLiveness(next: Liveness): void {
    liveness = next;
    showView();
  }

  function receive(event: BoardStreamEvent): void {
    if (event.kind === 'opened') setLiveness('live');
    else if (event.kind === 'interrupted') setLiveness('lost');
    else if (event.kind === 'failed') {
      closeStream();
      setLiveness('lost');
      readThenOpen(STREAM_RETRY_MILLISECONDS);
    } else if (event.kind === 'resync') {
      closeStream();
      readThenOpen(0);
    } else if (event.kind === 'stream-ended') {
      // The browser reconnects with Last-Event-ID; the read shows the
      // caller's new roles, as wire contracts section 10 asks.
      void read();
    } else if (view !== undefined) {
      sinceRead.push(event);
      const next = applyChange(view, event);
      if (next === view) return;
      view = next;
      showView();
    }
  }

  readThenOpen(0);
  return () => {
    stopped = true;
    closeStream();
    cancelRetry();
  };
}
