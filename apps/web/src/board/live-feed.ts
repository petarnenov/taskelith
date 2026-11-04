import type { Clock } from '../session/clock';
import type { BoardStreamEvent, BoardStreamListener, ReadFailed, ReadResult, StreamChange } from './board';

// The reconnect core that every live view shares (product UI "Web SPA live
// board updates"): a snapshot, then the stream after its position.

// connecting: before the stream first opens; lost: from a drop or resync
// until a stream opens again, and the view shows its last known state.
export type Liveness = 'connecting' | 'live' | 'lost';

export type LiveFeedState<View> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | ShownView<View>;

// snapshot counts the reads, so a view from a new read, such as one after
// a resync, differs from the view it replaces, whatever its position.
export interface ShownView<View> {
  readonly status: 'shown';
  readonly view: View;
  readonly liveness: Liveness;
  readonly snapshot: number;
}

// After a stream that closed for good, the feed waits this long before it
// opens a new one, so a stream that keeps failing is not opened in a loop.
export const STREAM_RETRY_MILLISECONDS = 10_000;

// A resync with no change since the last one waits this long, doubled for
// each further one up to the retry delay, so it cannot loop at once.
export const RESYNC_DELAY_MILLISECONDS = 1_000;

// A read that falls this far behind the stream is replaced by a resync.
export const MAX_CHANGES_DURING_READ = 1_000;

// What a view tells the feed: how to read it, where its snapshot stands,
// and how a stream change applies, returning the same view for none.
export interface LiveView<View> {
  readonly read: () => Promise<ReadResult<View>>;
  readonly positionOf: (view: View) => string;
  readonly apply: (view: View, change: StreamChange) => View;
}

export interface LiveFeedOptions<View> {
  readonly source: LiveView<View>;
  readonly openEvents: (after: string, listener: BoardStreamListener) => () => void;
  readonly clock: Clock;
  readonly show: (state: LiveFeedState<View>) => void;
}

export interface LiveFeed<View> {
  // Replaces the shown view by one a read outside the stream made of it.
  readonly amend: (change: (view: View) => View) => void;
  readonly stop: () => void;
}

// Reads the view, then follows the event stream from the snapshot's
// position; a failed read drops the view until a retry starts a new feed.
export function startLiveFeed<View>({ source, openEvents, clock, show }: LiveFeedOptions<View>): LiveFeed<View> {
  let stopped = false;
  let view: View | undefined;
  let liveness: Liveness = 'connecting';
  let reads = 0;
  let snapshot = 0;
  // Changes that arrive while a read runs, applied over its snapshot;
  // undefined while no read runs, so nothing is kept between reads.
  let duringRead: StreamChange[] | undefined;
  // Resyncs since the stream last delivered a change.
  let resyncs = 0;
  let closeStream = () => {};
  let cancelRetry = () => {};

  const showView = () => {
    if (view !== undefined) show({ status: 'shown', view, liveness, snapshot });
  };

  async function read(): Promise<boolean> {
    const thisRead = (reads += 1);
    duringRead = [];
    const result = await source.read();
    if (stopped || thisRead !== reads) return false;
    const changes = duringRead;
    duringRead = undefined;
    if (result.kind !== 'read') {
      closeStream();
      view = undefined;
      show({ status: 'failed', failure: result });
      return false;
    }
    view = changes.reduce(source.apply, result.value);
    snapshot = thisRead;
    showView();
    return true;
  }

  // The liveness stays as it is until the new stream reports that it opened.
  function open(): void {
    if (stopped || view === undefined) return;
    closeStream();
    closeStream = openEvents(source.positionOf(view), receive);
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

  function receiveChange(change: StreamChange): void {
    if (view === undefined) return;
    resyncs = 0;
    if (duringRead !== undefined) {
      if (duringRead.length >= MAX_CHANGES_DURING_READ) {
        resync();
        return;
      }
      duringRead.push(change);
    }
    const next = source.apply(view, change);
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

  function amend(change: (shown: View) => View): void {
    if (stopped || view === undefined) return;
    view = change(view);
    showView();
  }

  readThenOpen(0);
  return {
    amend,
    stop: () => {
      stopped = true;
      closeStream();
      cancelRetry();
    },
  };
}

function resyncDelay(resyncs: number): number {
  if (resyncs === 0) return 0;
  return Math.min(RESYNC_DELAY_MILLISECONDS * 2 ** (resyncs - 1), STREAM_RETRY_MILLISECONDS);
}
