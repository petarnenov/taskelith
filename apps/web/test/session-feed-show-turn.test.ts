import { describe, expect, it } from 'vitest';
import { startSessionFeed, type SessionFeedState } from '../src/agent-session/session-feed';
import type { ReadResult } from '../src/board/board';
import { agentSessionView, FakeBoardGateway, ManualClock, PROJECT, turn, turnPage } from './fakes';

// Drains the microtasks of the fakes' resolved promises; no timer runs.
async function settled(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
}

const at = (position: string) => ({ position, occurredAt: '2026-11-03T09:01:00.000Z' });

function start(gateway = new FakeBoardGateway()) {
  const states: SessionFeedState[] = [];
  const feed = startSessionFeed({
    projectId: PROJECT.projectId,
    sessionId: 'session-1',
    gateway,
    clock: new ManualClock(),
    show: (state) => states.push(state),
  });
  const shown = () => {
    const state = states.at(-1);
    if (state?.status !== 'shown') throw new Error(`The session is not shown: ${JSON.stringify(state)}`);
    return state;
  };
  return { gateway, feed, states, shown };
}

describe('showing a submitted turn', () => {
  it('shows the turn of a submission answer at once, in position order, and the stream replaces it once', async () => {
    const feed = start();
    await settled();
    feed.feed.showTurn(turn({ turnId: 'turn-3', position: 3, text: 'Sent', state: 'queued' }));
    expect(feed.shown().view.turns.map((known) => [known.turnId, known.state])).toEqual([
      ['turn-1', 'ended'],
      ['turn-2', 'delivered'],
      ['turn-3', 'queued'],
    ]);
    expect(feed.shown().view.freshness.turns['turn-3']).toBeUndefined();
    feed.gateway.lastStream().emit({
      kind: 'turn-changed',
      ...at('41'),
      sessionId: 'session-1',
      turn: turn({ turnId: 'turn-3', position: 3, text: 'Sent', state: 'delivered', generation: 1 }),
    });
    const turns = feed.shown().view.turns;
    expect(turns.map((known) => [known.turnId, known.state])).toEqual([
      ['turn-1', 'ended'],
      ['turn-2', 'delivered'],
      ['turn-3', 'delivered'],
    ]);
    expect(feed.shown().view.freshness.turns['turn-3']).toBe('41');
  });

  it('keeps the read or event state of a turn the view already knows', async () => {
    const feed = start();
    await settled();
    const { view } = feed.shown();
    feed.feed.showTurn(turn({ turnId: 'turn-2', position: 2, text: 'Continue', state: 'queued' }));
    expect(feed.shown().view).toBe(view);
  });

  it('shows a turn the stream delivered before the answer only once, in the stream state', async () => {
    const feed = start();
    await settled();
    feed.gateway.lastStream().emit({
      kind: 'turn-changed',
      ...at('41'),
      sessionId: 'session-1',
      turn: turn({ turnId: 'turn-3', position: 3, text: 'Sent', state: 'delivered', generation: 1 }),
    });
    feed.feed.showTurn(turn({ turnId: 'turn-3', position: 3, text: 'Sent', state: 'queued' }));
    expect(feed.shown().view.turns.filter((known) => known.turnId === 'turn-3').map((known) => known.state)).toEqual(['delivered']);
  });

  it('keeps a turn shown during a snapshot read over the snapshot, even an older one', async () => {
    const gateway = new FakeBoardGateway();
    const feed = start(gateway);
    await settled();
    let resolve!: (value: ReadResult<ReturnType<typeof agentSessionView>>) => void;
    gateway.readAgentSession.mockReturnValueOnce(new Promise((settle) => (resolve = settle)));
    gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    feed.feed.showTurn(turn({ turnId: 'turn-3', position: 3, text: 'Sent', state: 'queued' }));
    expect(feed.shown().view.turns.map((known) => known.turnId)).toEqual(['turn-1', 'turn-2', 'turn-3']);
    resolve({ kind: 'read', value: agentSessionView() });
    await settled();
    expect(feed.shown().view.turns.map((known) => known.turnId)).toEqual(['turn-1', 'turn-2', 'turn-3']);
    expect(feed.shown().view.freshness.turns['turn-3']).toBeUndefined();
    expect(feed.shown().snapshot).toBe(2);
  });

  it('shows nothing before the session is shown, and keeps the turn through a window read but not a new snapshot', async () => {
    const gateway = new FakeBoardGateway();
    let resolve!: (value: ReadResult<ReturnType<typeof agentSessionView>>) => void;
    gateway.readAgentSession.mockReturnValueOnce(new Promise((settle) => (resolve = settle)));
    const feed = start(gateway);
    feed.feed.showTurn(turn({ turnId: 'turn-3', position: 3 }));
    expect(feed.states).toEqual([]);
    resolve({ kind: 'read', value: agentSessionView() });
    await settled();
    feed.feed.showTurn(turn({ turnId: 'turn-3', position: 3, state: 'queued' }));
    expect(feed.shown().view.turns).toHaveLength(3);
    gateway.lastStream().emit({ kind: 'resync' });
    await settled();
    expect(feed.shown().view.turns).toHaveLength(turnPage().turns.length);
  });
});
