import { describe, expect, it } from 'vitest';
import type { Board, BoardStreamEvent, ReadResult } from '../src/board/board';
import { MAX_CHANGES_DURING_READ, RESYNC_DELAY_MILLISECONDS, startBoardFeed, type BoardFeedState } from '../src/board/board-feed';
import { agentSession, FakeBoardGateway, ManualClock, PROJECT, turn } from './fakes';

// Decision Q8: the session events the stream now carries leave the board's
// reconnect accounting as it was before they were listened to.

// Drains the microtasks of the fakes' resolved promises; no timer runs.
async function settled(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
}

function start() {
  const gateway = new FakeBoardGateway();
  const clock = new ManualClock();
  const states: BoardFeedState[] = [];
  startBoardFeed({ projectId: PROJECT.projectId, gateway, clock, show: (state) => states.push(state) });
  const shown = () => {
    const state = states.at(-1);
    if (state?.status !== 'shown') throw new Error(`The board is not shown: ${JSON.stringify(state)}`);
    return state;
  };
  return { gateway, clock, states, shown };
}

const at = (position: string) => ({ position, occurredAt: '2026-11-03T09:01:00.000Z' });

// Alternates turn and session changes at each position after the snapshot's 40.
function emitSessionChanges(stream: { emit: (event: BoardStreamEvent) => void }, count: number): void {
  for (let offset = 1; offset <= count; offset += 1) {
    const stamp = at(String(40 + offset));
    if (offset % 2 === 0) stream.emit({ kind: 'agent-session-changed', ...stamp, session: agentSession() });
    else stream.emit({ kind: 'turn-changed', ...stamp, sessionId: 'session-1', turn: turn() });
  }
}

describe('the board feed under session events', () => {
  it('keeps a board read running however many session events arrive during it', async () => {
    const feed = start();
    await settled();
    const stream = feed.gateway.lastStream();
    feed.gateway.readBoard.mockReturnValueOnce(new Promise<ReadResult<Board>>(() => {}));
    stream.emit({ kind: 'stream-ended' });
    emitSessionChanges(stream, MAX_CHANGES_DURING_READ + 1);
    expect(stream.isClosed()).toBe(false);
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(2);
    expect(feed.shown().liveness).toBe('connecting');
    expect(feed.states).toHaveLength(1);
  });

  it('waits before a repeated resync as before when only session events came between', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    emitSessionChanges(feed.gateway.lastStream(), 2);
    feed.gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    expect(feed.clock.pendingDelays()).toEqual([RESYNC_DELAY_MILLISECONDS]);
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(2);
    feed.clock.advance(RESYNC_DELAY_MILLISECONDS);
    await settled();
    expect(feed.gateway.readBoard).toHaveBeenCalledTimes(3);
  });
});
