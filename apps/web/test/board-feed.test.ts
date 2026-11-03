import { describe, expect, it } from 'vitest';
import type { Board, BoardStreamEvent, ReadResult } from '../src/board/board';
import {
  MAX_CHANGES_DURING_READ,
  RESYNC_DELAY_MILLISECONDS,
  startBoardFeed,
  STREAM_RETRY_MILLISECONDS,
  type BoardFeedState,
} from '../src/board/board-feed';
import { board, card, FakeBoardGateway, ManualClock, PROJECT } from './fakes';

// A promise the test resolves when it chooses, so no read races it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// Drains the microtasks of the fakes' resolved promises; no timer runs.
async function settled(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

function start(gateway = new FakeBoardGateway(), clock = new ManualClock()) {
  const states: BoardFeedState[] = [];
  const stop = startBoardFeed({ projectId: PROJECT.projectId, gateway, clock, show: (state) => states.push(state) });
  const last = () => states.at(-1);
  const shown = () => {
    const state = last();
    if (state?.status !== 'shown') throw new Error(`The board is not shown: ${JSON.stringify(state)}`);
    return state;
  };
  return { gateway, clock, states, stop, last, shown };
}

const read = (value: Board): ReadResult<Board> => ({ kind: 'read', value });
const at = (position: string, minute = 1) => ({ position, occurredAt: `2026-11-03T09:0${minute}:00.000Z` });

// Emits one card change at each position after the snapshot's 40.
function emitChanges(stream: { emit: (event: BoardStreamEvent) => void }, count: number): void {
  for (let offset = 1; offset <= count; offset += 1) {
    stream.emit({ kind: 'card-changed', ...at(String(40 + offset)), card: card() });
  }
}

describe('the board feed', () => {
  it('reads the board, then opens the stream after its position', async () => {
    const feed = start();
    await settled();
    expect(feed.gateway.readBoard).toHaveBeenCalledWith(PROJECT.projectId);
    expect(feed.gateway.lastStream()).toMatchObject({ projectId: PROJECT.projectId, after: '40' });
    expect(feed.shown().liveness).toBe('connecting');
    feed.gateway.lastStream().emit({ kind: 'opened' });
    expect(feed.shown()).toMatchObject({ liveness: 'live', view: { knownAt: '2026-11-03T09:00:00.000Z' } });
  });

  it('applies changes above the position and skips the ones the snapshot holds', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readBoard.mockResolvedValueOnce(read(board({ cards: [card()] })));
    const feed = start(gateway);
    await settled();
    const stream = feed.gateway.lastStream();
    const count = feed.states.length;
    stream.emit({ kind: 'card-changed', ...at('40'), card: card({ title: 'Already known' }) });
    expect(feed.states).toHaveLength(count);
    stream.emit({ kind: 'card-changed', ...at('41', 2), card: card({ title: 'Moved', column: 'verify' }) });
    stream.emit({ kind: 'card-changed', ...at('42', 3), card: card({ runId: 'run-2', title: 'New' }) });
    stream.emit({ kind: 'board-changed', ...at('43', 1), workersOnline: 0 });
    const { view } = feed.shown();
    expect(view.board.cards.map(({ runId, title, column }) => [runId, title, column])).toEqual([
      ['run-1', 'Moved', 'verify'],
      ['run-2', 'New', 'implement'],
    ]);
    expect(view.board).toMatchObject({ position: '43', workersOnline: 0 });
    expect(view.knownAt).toBe('2026-11-03T09:03:00.000Z');
  });

  it('compares positions beyond the safe integers exactly', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readBoard.mockResolvedValueOnce(read(board({ position: '9007199254740993' })));
    const feed = start(gateway);
    await settled();
    feed.gateway.lastStream().emit({ kind: 'board-changed', ...at('9007199254740992'), workersOnline: 5 });
    expect(feed.shown().view.board.workersOnline).toBe(1);
    feed.gateway.lastStream().emit({ kind: 'board-changed', ...at('9007199254740994'), workersOnline: 5 });
    expect(feed.shown().view.board.workersOnline).toBe(5);
  });

  it('shows the live updates as lost while the browser reconnects, and live again once open', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    stream.emit({ kind: 'opened' });
    stream.emit({ kind: 'interrupted' });
    expect(feed.shown().liveness).toBe('lost');
    stream.emit({ kind: 'opened' });
    expect(feed.shown().liveness).toBe('live');
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(1);
  });

  it('reads the board again after a stream that failed, and opens a new one only after the retry delay', async () => {
    const feed = start();
    await settled();
    feed.gateway.readBoard.mockResolvedValueOnce(read(board({ position: '50', workersOnline: 3 })));
    feed.gateway.lastStream().emit({ kind: 'failed' });
    expect(feed.gateway.lastStream().isClosed()).toBe(true);
    await settled();
    expect(feed.shown()).toMatchObject({ liveness: 'lost', view: { board: { workersOnline: 3 } } });
    expect(feed.clock.pendingDelays()).toEqual([STREAM_RETRY_MILLISECONDS]);
    feed.clock.advance(STREAM_RETRY_MILLISECONDS - 1);
    expect(feed.gateway.streams).toHaveLength(1);
    feed.clock.advance(1);
    expect(feed.gateway.streams).toHaveLength(2);
    expect(feed.gateway.lastStream().after).toBe('50');
  });

  it('shows no board data once a read after a failed stream fails', async () => {
    const feed = start();
    await settled();
    feed.gateway.readBoard.mockResolvedValueOnce({ kind: 'denied' });
    feed.gateway.lastStream().emit({ kind: 'failed' });
    await settled();
    expect(feed.last()).toEqual({ status: 'failed', failure: { kind: 'denied' } });
    expect(feed.clock.pendingDelays()).toEqual([]);
    expect(feed.gateway.openStreams()).toEqual([]);
  });

  it('closes the stream on a resync, reads the board, and opens a new stream after its position', async () => {
    const feed = start();
    await settled();
    const first = feed.gateway.lastStream();
    feed.gateway.readBoard.mockResolvedValueOnce(read(board({ position: '90' })));
    first.emit({ kind: 'resync' });
    expect(first.isClosed()).toBe(true);
    await settled();
    expect(feed.gateway.openStreams()).toHaveLength(1);
    expect(feed.gateway.lastStream().after).toBe('90');
  });

  it('reads the board again after stream-ended and keeps the changes that arrive during the read', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    const snapshot = deferred<ReadResult<Board>>();
    feed.gateway.readBoard.mockReturnValueOnce(snapshot.promise);
    stream.emit({ kind: 'stream-ended' });
    stream.emit({ kind: 'card-changed', ...at('45', 2), card: card({ runId: 'run-late', title: 'Late' }) });
    stream.emit({ kind: 'card-changed', ...at('43', 1), card: card({ runId: 'run-early', title: 'Early' }) });
    snapshot.resolve(read(board({ position: '44', callerMayAct: false, cards: [card({ runId: 'run-early', title: 'Early' })] })));
    await settled();
    const { view } = feed.shown();
    expect(view.board.callerMayAct).toBe(false);
    expect(view.board.cards.map((known) => known.runId)).toEqual(['run-early', 'run-late']);
    expect(view.board.position).toBe('45');
    expect(stream.isClosed()).toBe(false);
  });

  it('keeps the live updates lost after a failed stream until the new stream opens', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'opened' });
    feed.gateway.lastStream().emit({ kind: 'failed' });
    await settled();
    feed.clock.advance(STREAM_RETRY_MILLISECONDS);
    expect(feed.gateway.openStreams()).toHaveLength(1);
    expect(feed.shown().liveness).toBe('lost');
    feed.gateway.lastStream().emit({ kind: 'opened' });
    expect(feed.shown().liveness).toBe('live');
  });

  it('shows the live updates as lost from a resync until the new stream opens', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'opened' });
    const snapshot = deferred<ReadResult<Board>>();
    feed.gateway.readBoard.mockReturnValueOnce(snapshot.promise);
    feed.gateway.lastStream().emit({ kind: 'resync' });
    expect(feed.shown().liveness).toBe('lost');
    snapshot.resolve(read(board({ position: '90' })));
    await settled();
    expect(feed.gateway.lastStream().after).toBe('90');
    expect(feed.shown().liveness).toBe('lost');
    feed.gateway.lastStream().emit({ kind: 'opened' });
    expect(feed.shown().liveness).toBe('live');
  });

  it('recovers from a first resync at once and waits longer before each repeated one', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(2);
    expect(feed.gateway.streams).toHaveLength(2);
    for (const [repeat, delay] of [RESYNC_DELAY_MILLISECONDS, 2 * RESYNC_DELAY_MILLISECONDS].entries()) {
      feed.gateway.lastStream().emit({ kind: 'resync' });
      await settled();
      expect(feed.clock.pendingDelays()).toEqual([delay]);
      expect(feed.gateway.openStreams()).toEqual([]);
      feed.clock.advance(delay);
      await settled();
      expect(feed.gateway.readBoard).toHaveBeenCalledTimes(3 + repeat);
      expect(feed.gateway.openStreams()).toHaveLength(1);
    }
  });

  it('waits at most the stream retry delay between repeated resyncs', async () => {
    const feed = start();
    await settled();
    for (let resync = 0; resync < 6; resync += 1) {
      feed.gateway.lastStream().emit({ kind: 'resync' });
      await settled();
      feed.clock.advance(Math.max(0, ...feed.clock.pendingDelays()));
      await settled();
    }
    feed.gateway.lastStream().emit({ kind: 'resync' });
    expect(feed.clock.pendingDelays()).toEqual([STREAM_RETRY_MILLISECONDS]);
  });

  it('recovers from a resync at once again after the stream delivered a change', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    feed.gateway.lastStream().emit({ kind: 'card-changed', ...at('41'), card: card() });
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    expect(feed.clock.pendingDelays()).toEqual([]);
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(3);
    expect(feed.gateway.openStreams()).toHaveLength(1);
  });

  it('cancels a pending resync when stopped', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    feed.gateway.lastStream().emit({ kind: 'resync' });
    feed.stop();
    feed.clock.advance(RESYNC_DELAY_MILLISECONDS);
    await settled();
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(2);
  });

  it('keeps no changes while no read runs, however many the stream delivers', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    emitChanges(stream, MAX_CHANGES_DURING_READ + 1);
    feed.gateway.readBoard.mockReturnValueOnce(deferred<ReadResult<Board>>().promise);
    stream.emit({ kind: 'stream-ended' });
    stream.emit({ kind: 'card-changed', ...at(String(42 + MAX_CHANGES_DURING_READ)), card: card() });
    expect(stream.isClosed()).toBe(false);
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(2);
  });

  it('replaces a read that falls too far behind the stream with a resync', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    const stalled = deferred<ReadResult<Board>>();
    feed.gateway.readBoard.mockReturnValueOnce(stalled.promise);
    stream.emit({ kind: 'stream-ended' });
    emitChanges(stream, MAX_CHANGES_DURING_READ);
    expect(stream.isClosed()).toBe(false);
    feed.gateway.readBoard.mockResolvedValueOnce(read(board({ position: '5000' })));
    stream.emit({ kind: 'card-changed', ...at(String(41 + MAX_CHANGES_DURING_READ)), card: card() });
    expect(stream.isClosed()).toBe(true);
    expect(feed.shown().liveness).toBe('lost');
    stalled.resolve(read(board({ position: '45' })));
    await settled();
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(3);
    expect(feed.shown().view.board.position).toBe('5000');
    expect(feed.gateway.lastStream().after).toBe('5000');
  });

  it('keeps only the answer of the latest read', async () => {
    const feed = start();
    await settled();
    const older = deferred<ReadResult<Board>>();
    feed.gateway.readBoard.mockReturnValueOnce(older.promise).mockResolvedValueOnce(read(board({ position: '70' })));
    feed.gateway.lastStream().emit({ kind: 'stream-ended' });
    feed.gateway.lastStream().emit({ kind: 'stream-ended' });
    await settled();
    older.resolve(read(board({ position: '60', workersOnline: 9 })));
    await settled();
    expect(feed.shown().view.board).toMatchObject({ position: '70', workersOnline: 1 });
  });

  it('shows the failure of the first read and opens no stream', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readBoard.mockResolvedValueOnce({ kind: 'unavailable' });
    const feed = start(gateway);
    await settled();
    expect(feed.states).toEqual([{ status: 'failed', failure: { kind: 'unavailable' } }]);
    expect(feed.gateway.streams).toEqual([]);
  });

  it('stops: closes the stream and ignores a late read', async () => {
    const feed = start();
    await settled();
    const late = deferred<ReadResult<Board>>();
    feed.gateway.readBoard.mockReturnValueOnce(late.promise);
    feed.gateway.lastStream().emit({ kind: 'stream-ended' });
    const count = feed.states.length;
    feed.stop();
    expect(feed.gateway.lastStream().isClosed()).toBe(true);
    late.resolve(read(board({ position: '99' })));
    await settled();
    expect(feed.states).toHaveLength(count);
  });

  it('cancels a pending stream retry when stopped', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'failed' });
    await settled();
    feed.stop();
    expect(feed.clock.pendingDelays()).toEqual([]);
    feed.clock.advance(STREAM_RETRY_MILLISECONDS);
    expect(feed.gateway.streams).toHaveLength(1);
  });

  it('opens no stream when it was stopped before the first read answered', async () => {
    const feed = start();
    feed.stop();
    await settled();
    expect(feed.states).toEqual([]);
    expect(feed.gateway.streams).toEqual([]);
  });
});
