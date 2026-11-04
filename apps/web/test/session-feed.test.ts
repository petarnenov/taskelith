import { describe, expect, it } from 'vitest';
import { MAX_TURN_PAGES, startSessionFeed, TURN_WINDOW, type SessionFeedState } from '../src/agent-session/session-feed';
import type { ReadResult, Turn, TurnPage } from '../src/board/board';
import { RESYNC_DELAY_MILLISECONDS, STREAM_RETRY_MILLISECONDS } from '../src/board/live-feed';
import { agentSession, agentSessionView, card, FakeBoardGateway, ManualClock, PROJECT, turn, turnPage } from './fakes';

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
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
}

const read = <T>(value: T): ReadResult<T> => ({ kind: 'read', value });
const at = (position: string, minute = 1) => ({ position, occurredAt: `2026-11-03T09:0${minute}:00.000Z` });

// Turns at the positions from first to last, in order.
function turnsAt(first: number, last: number): Turn[] {
  return Array.from({ length: last - first + 1 }, (_, offset) => turn({ turnId: `turn-${first + offset}`, position: first + offset }));
}

function start(gateway = new FakeBoardGateway(), clock = new ManualClock()) {
  const states: SessionFeedState[] = [];
  const feed = startSessionFeed({ projectId: PROJECT.projectId, sessionId: 'session-1', gateway, clock, show: (state) => states.push(state) });
  const last = () => states.at(-1);
  const shown = () => {
    const state = last();
    if (state?.status !== 'shown') throw new Error(`The session is not shown: ${JSON.stringify(state)}`);
    return state;
  };
  const positions = () => shown().view.turns.map((known) => known.position);
  return { gateway, clock, states, feed, last, shown, positions };
}

describe('the session feed', () => {
  it('reads the session and its last window of turns, then opens the stream after the lowest position', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce(read(agentSessionView({ position: '45', session: agentSession({ lastTurnPosition: 250 }) })));
    gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ position: '44', asOf: '2026-11-03T08:59:00.000Z', turns: turnsAt(151, 250) })));
    const feed = start(gateway);
    await settled();
    expect(gateway.listAgentSessionTurns).toHaveBeenCalledWith(PROJECT.projectId, 'session-1', 150);
    expect(feed.gateway.lastStream()).toMatchObject({ projectId: PROJECT.projectId, after: '44' });
    const { view, liveness, earlier } = feed.shown();
    expect(view).toMatchObject({ before: 150, position: '44', knownAt: '2026-11-03T08:59:00.000Z' });
    expect(feed.positions()).toEqual(Array.from({ length: 100 }, (_, offset) => 151 + offset));
    expect(liveness).toBe('connecting');
    expect(earlier).toBe('ready');
    feed.gateway.lastStream().emit({ kind: 'opened' });
    expect(feed.shown().liveness).toBe('live');
  });

  it('reads from the first turn when the session has fewer turns than a window', async () => {
    const feed = start();
    await settled();
    expect(feed.gateway.listAgentSessionTurns).toHaveBeenCalledWith(PROJECT.projectId, 'session-1', 0);
    expect(feed.shown().view).toMatchObject({ before: 0, position: '40', knownAt: '2026-11-03T09:00:00.000Z' });
    expect(feed.positions()).toEqual([1, 2]);
  });

  it('follows the next cursor of a window that gained turns between the reads', async () => {
    const gateway = new FakeBoardGateway();
    gateway.listAgentSessionTurns
      .mockResolvedValueOnce(read(turnPage({ turns: turnsAt(1, 2), next: 2 })))
      .mockResolvedValueOnce(read(turnPage({ position: '42', turns: turnsAt(3, 3) })));
    const feed = start(gateway);
    await settled();
    expect(gateway.listAgentSessionTurns.mock.calls.map(([, , after]) => after)).toEqual([0, 2]);
    expect(feed.positions()).toEqual([1, 2, 3]);
    expect(feed.shown().view.position).toBe('40');
  });

  it.each([
    ['a next cursor that does not advance', (after: number) => turnPage({ turns: [], next: after }), 1],
    ['a server that keeps naming new cursors', (after: number) => turnPage({ turns: turnsAt(after + 1, after + 1), next: after + 1 }), MAX_TURN_PAGES],
  ])('reads %s as unreachable instead of looping', async (_, pageOf, pages) => {
    const gateway = new FakeBoardGateway();
    gateway.listAgentSessionTurns.mockImplementation(async (_project, _session, after) => read(pageOf(after)));
    const feed = start(gateway);
    for (let round = 0; round < 20 * pages; round += 1) await Promise.resolve();
    expect(feed.last()).toEqual({ status: 'failed', failure: { kind: 'unavailable' } });
    expect(gateway.listAgentSessionTurns).toHaveBeenCalledTimes(pages);
    expect(feed.gateway.streams).toHaveLength(0);
  });

  it('shows a failed session read, and a failed turn read, with no data', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce({ kind: 'not-found' });
    const feed = start(gateway);
    await settled();
    expect(feed.last()).toEqual({ status: 'failed', failure: { kind: 'not-found' } });
    gateway.readAgentSession.mockResolvedValueOnce(read(agentSessionView()));
    gateway.listAgentSessionTurns.mockResolvedValueOnce({ kind: 'denied', requiredRole: 'project-viewer' });
    const again = start(gateway);
    await settled();
    expect(again.last()).toEqual({ status: 'failed', failure: { kind: 'denied', requiredRole: 'project-viewer' } });
  });

  it('applies the turn and session changes of its session above its position, and skips the rest', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    const count = feed.states.length;
    stream.emit({ kind: 'turn-changed', ...at('40'), sessionId: 'session-1', turn: turn({ turnId: 'turn-2', position: 2, text: 'Known' }) });
    stream.emit({ kind: 'turn-changed', ...at('41'), sessionId: 'session-2', turn: turn({ turnId: 'other', position: 3 }) });
    stream.emit({ kind: 'agent-session-changed', ...at('42'), session: agentSession({ sessionId: 'session-2', lastTurnPosition: 9 }) });
    stream.emit({ kind: 'card-changed', ...at('43'), card: card({ runId: 'run-2' }) });
    stream.emit({ kind: 'board-changed', ...at('44'), workersOnline: 0 });
    expect(feed.states).toHaveLength(count);
    stream.emit({ kind: 'turn-changed', ...at('45', 2), sessionId: 'session-1', turn: turn({ turnId: 'turn-2', position: 2, state: 'ended', generation: 1, outcome: 'completed' }) });
    stream.emit({ kind: 'turn-changed', ...at('46', 3), sessionId: 'session-1', turn: turn({ turnId: 'turn-3', position: 3, state: 'queued' }) });
    stream.emit({ kind: 'agent-session-changed', ...at('47', 4), session: agentSession({ lastTurnPosition: 3 }) });
    const { view } = feed.shown();
    expect(view.turns.map(({ turnId, state }) => [turnId, state])).toEqual([['turn-1', 'ended'], ['turn-2', 'ended'], ['turn-3', 'queued']]);
    expect(view).toMatchObject({ position: '47', knownAt: '2026-11-03T09:04:00.000Z', session: { lastTurnPosition: 3 } });
  });

  it('keeps the run card the stream last showed, for the activity read', async () => {
    const feed = start();
    await settled();
    const changed = card({ session: { state: 'waiting-for-person' } });
    feed.gateway.lastStream().emit({ kind: 'card-changed', ...at('41'), card: changed });
    expect(feed.shown().view).toMatchObject({ card: changed, position: '41' });
  });

  it('places a changed turn before the window above the known ones in position order', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce(read(agentSessionView({ session: agentSession({ lastTurnPosition: 120 }) })));
    gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ turns: turnsAt(21, 120) })));
    const feed = start(gateway);
    await settled();
    feed.gateway.lastStream().emit({ kind: 'turn-changed', ...at('41'), sessionId: 'session-1', turn: turn({ turnId: 'turn-5', position: 5 }) });
    expect(feed.positions().slice(0, 2)).toEqual([5, 21]);
    expect(feed.shown().view.before).toBe(20);
  });

  it('applies the changes that arrive during a read over its snapshot', async () => {
    const gateway = new FakeBoardGateway();
    const held = deferred<ReadResult<TurnPage>>();
    gateway.listAgentSessionTurns.mockReturnValueOnce(held.promise);
    const feed = start(gateway);
    await settled();
    expect(feed.last()).toBeUndefined();
    held.resolve(read(turnPage()));
    await settled();
    const again = deferred<ReadResult<TurnPage>>();
    gateway.listAgentSessionTurns.mockReturnValueOnce(again.promise);
    feed.gateway.lastStream().emit({ kind: 'stream-ended' });
    await settled();
    feed.gateway.lastStream().emit({ kind: 'turn-changed', ...at('41'), sessionId: 'session-1', turn: turn({ turnId: 'turn-3', position: 3 }) });
    again.resolve(read(turnPage()));
    await settled();
    expect(feed.positions()).toEqual([1, 2, 3]);
    expect(feed.shown().view.position).toBe('41');
  });
});

describe('earlier turns', () => {
  async function startWindowed(lastTurnPosition = 250) {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce(read(agentSessionView({ session: agentSession({ lastTurnPosition }) })));
    const first = Math.max(0, lastTurnPosition - TURN_WINDOW);
    gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ turns: turnsAt(first + 1, lastTurnPosition) })));
    const feed = start(gateway);
    await settled();
    return feed;
  }

  it('reads the window before the shown turns and joins it, down to the first turn', async () => {
    const feed = await startWindowed();
    feed.gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ turns: turnsAt(51, 150), next: 150 })));
    feed.feed.loadEarlier();
    expect(feed.shown().earlier).toBe('reading');
    await settled();
    expect(feed.gateway.listAgentSessionTurns).toHaveBeenLastCalledWith(PROJECT.projectId, 'session-1', 50);
    expect(feed.shown()).toMatchObject({ earlier: 'ready', view: { before: 50 } });
    expect(feed.positions()).toEqual(Array.from({ length: 200 }, (_, offset) => 51 + offset));
    feed.gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ turns: turnsAt(1, 50), next: 50 })));
    feed.feed.loadEarlier();
    await settled();
    expect(feed.gateway.listAgentSessionTurns).toHaveBeenLastCalledWith(PROJECT.projectId, 'session-1', 0);
    expect(feed.shown().view.before).toBe(0);
    expect(feed.positions()).toHaveLength(250);
    const calls = feed.gateway.listAgentSessionTurns.mock.calls.length;
    feed.feed.loadEarlier();
    expect(feed.gateway.listAgentSessionTurns).toHaveBeenCalledTimes(calls);
  });

  it('keeps the newer state of a turn the stream showed, and reads one window at a time', async () => {
    const feed = await startWindowed();
    const changed = turn({ turnId: 'turn-150', position: 150, text: 'Changed' });
    feed.gateway.lastStream().emit({ kind: 'turn-changed', ...at('41'), sessionId: 'session-1', turn: changed });
    const held = deferred<ReadResult<TurnPage>>();
    feed.gateway.listAgentSessionTurns.mockReturnValueOnce(held.promise);
    feed.feed.loadEarlier();
    feed.feed.loadEarlier();
    expect(feed.gateway.listAgentSessionTurns).toHaveBeenCalledTimes(2);
    held.resolve(read(turnPage({ turns: turnsAt(51, 150) })));
    await settled();
    expect(feed.shown().view.turns.find((known) => known.turnId === 'turn-150')?.text).toBe('Changed');
    expect(feed.positions()).toHaveLength(200);
  });

  it('shows a failed earlier read, whose retry reads it again, and keeps the shown turns', async () => {
    const feed = await startWindowed();
    feed.gateway.listAgentSessionTurns.mockResolvedValueOnce({ kind: 'unavailable' });
    feed.feed.loadEarlier();
    await settled();
    expect(feed.shown()).toMatchObject({ earlier: 'failed', view: { before: 150 } });
    expect(feed.positions()).toHaveLength(100);
    feed.gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ turns: turnsAt(51, 150) })));
    feed.feed.loadEarlier();
    await settled();
    expect(feed.shown()).toMatchObject({ earlier: 'ready', view: { before: 50 } });
  });

  it('drops an earlier read that a new snapshot overtook, which shows the last window again', async () => {
    const feed = await startWindowed();
    const held = deferred<ReadResult<TurnPage>>();
    feed.gateway.listAgentSessionTurns.mockReturnValueOnce(held.promise);
    feed.feed.loadEarlier();
    feed.gateway.readAgentSession.mockResolvedValueOnce(read(agentSessionView({ session: agentSession({ lastTurnPosition: 251 }) })));
    feed.gateway.listAgentSessionTurns.mockResolvedValueOnce(read(turnPage({ turns: turnsAt(152, 251) })));
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    expect(feed.shown()).toMatchObject({ earlier: 'ready', view: { before: 151 } });
    held.resolve(read(turnPage({ turns: turnsAt(51, 150) })));
    await settled();
    expect(feed.shown().view.before).toBe(151);
    expect(feed.positions()).toHaveLength(100);
  });

  it('reads nothing after the feed stopped', async () => {
    const feed = await startWindowed();
    const held = deferred<ReadResult<TurnPage>>();
    feed.gateway.listAgentSessionTurns.mockReturnValueOnce(held.promise);
    feed.feed.loadEarlier();
    feed.feed.stop();
    const count = feed.states.length;
    held.resolve(read(turnPage({ turns: turnsAt(51, 150) })));
    await settled();
    expect(feed.states).toHaveLength(count);
    expect(feed.gateway.openStreams()).toHaveLength(0);
  });
});

describe('the session feed reconnect', () => {
  it('reads again and opens a new stream after a resync, waiting longer for a repeated one', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    expect(feed.gateway.readAgentSession).toHaveBeenCalledTimes(2);
    expect(feed.shown().snapshot).toBe(2);
    feed.gateway.lastStream().emit({ kind: 'resync' });
    expect(feed.shown().liveness).toBe('lost');
    expect(feed.clock.pendingDelays()).toEqual([RESYNC_DELAY_MILLISECONDS]);
    feed.clock.advance(RESYNC_DELAY_MILLISECONDS);
    await settled();
    expect(feed.gateway.readAgentSession).toHaveBeenCalledTimes(3);
    expect(feed.gateway.openStreams()).toHaveLength(1);
  });

  it('reads again after a stream that closed for good, and opens a new one after the retry delay', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'failed' });
    await settled();
    expect(feed.shown()).toMatchObject({ liveness: 'lost', snapshot: 2 });
    expect(feed.gateway.openStreams()).toHaveLength(0);
    feed.clock.advance(STREAM_RETRY_MILLISECONDS);
    expect(feed.gateway.openStreams()).toHaveLength(1);
  });

  it('reads again on a stream end and keeps the stream, which the browser reconnects', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    stream.emit({ kind: 'opened' });
    stream.emit({ kind: 'stream-ended' });
    await settled();
    expect(feed.gateway.readAgentSession).toHaveBeenCalledTimes(2);
    expect(stream.isClosed()).toBe(false);
    stream.emit({ kind: 'interrupted' });
    expect(feed.shown().liveness).toBe('lost');
  });
});
