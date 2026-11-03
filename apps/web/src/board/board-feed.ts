import type { Clock } from '../session/clock';
import type { BoardChange, BoardGateway, BoardStreamEvent, ReadFailed } from './board';
import { applyChange, viewOf, type BoardView } from './board-model';

// connecting: before the stream first opens; lost: from a drop or resync
// until a stream opens again, and the board shows its last known state.
export type Liveness = 'connecting' | 'live' | 'lost';

export type BoardFeedState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | { readonly status: 'shown'; readonly view: BoardView; readonly liveness: Liveness };

// After a stream that closed for good, the board waits this long before it
// opens a new one, so a stream that keeps failing is not opened in a loop.
export const STREAM_RETRY_MILLISECONDS = 10_000;

// A resync with no change since the last one waits this long, doubled for
// each further one up to the retry delay, so it cannot loop at once.
export const RESYNC_DELAY_MILLISECONDS = 1_000;

// A read that falls this far behind the stream is replaced by a resync.
export const MAX_CHANGES_DURING_READ = 1_000;

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
  // Changes that arrive while a read runs, applied over its snapshot;
  // undefined while no read runs, so nothing is kept between reads.
  let duringRead: BoardChange[] | undefined;
  // Resyncs since the stream last delivered a change.
  let resyncs = 0;
  let closeStream = () => {};
  let cancelRetry = () => {};

  const showView = () => {
    if (view !== undefined) show({ status: 'shown', view, liveness });
  };

  async function read(): Promise<boolean> {
    const thisRead = (reads += 1);
    duringRead = [];
    const result = await gateway.readBoard(projectId);
    if (stopped || thisRead !== reads) return false;
    const changes = duringRead;
    duringRead = undefined;
    if (result.kind !== 'read') {
      closeStream();
      view = undefined;
      show({ status: 'failed', failure: result });
      return false;
    }
    view = changes.reduce(applyChange, viewOf(result.value));
    showView();
    return true;
  }

  // The liveness stays as it is until the new stream reports that it opened.
  function open(): void {
    if (stopped || view === undefined) return;
    closeStream();
    closeStream = gateway.openEvents(projectId, view.board.position, receive);
  }

  function later(delay: number, run: () => void): void {
    cancelRetry();
    cancelRetry = clock.schedule(delay, run);
  }

  function readThenOpen(delay: number): void {
    void read().then((shown) => {
      if (!shown) return;
      if (delay === 0) open();
      else later(delay, open);
    });
  }

  function setLiveness(next: Liveness): void {
    liveness = next;
    showView();
  }

  function resync(): void {
    closeStream();
    setLiveness('lost');
    const delay = resyncDelay(resyncs);
    resyncs += 1;
    if (delay === 0) readThenOpen(0);
    else later(delay, () => readThenOpen(0));
  }

  function receiveChange(change: BoardChange): void {
    if (view === undefined) return;
    resyncs = 0;
    if (duringRead !== undefined) {
      if (duringRead.length >= MAX_CHANGES_DURING_READ) {
        resync();
        return;
      }
      duringRead.push(change);
    }
    const next = applyChange(view, change);
    if (next === view) return;
    view = next;
    showView();
  }

  function receive(event: BoardStreamEvent): void {
    if (event.kind === 'opened') setLiveness('live');
    else if (event.kind === 'interrupted') setLiveness('lost');
    else if (event.kind === 'failed') {
      closeStream();
      setLiveness('lost');
      readThenOpen(STREAM_RETRY_MILLISECONDS);
    } else if (event.kind === 'resync') resync();
    else if (event.kind === 'stream-ended') {
      // The browser reconnects with Last-Event-ID; the read shows the
      // caller's new roles, as wire contracts section 10 asks.
      void read();
    } else receiveChange(event);
  }

  readThenOpen(0);
  return () => {
    stopped = true;
    closeStream();
    cancelRetry();
  };
}

function resyncDelay(resyncs: number): number {
  if (resyncs === 0) return 0;
  return Math.min(RESYNC_DELAY_MILLISECONDS * 2 ** (resyncs - 1), STREAM_RETRY_MILLISECONDS);
}
