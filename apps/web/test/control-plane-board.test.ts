import { describe, expect, it, vi } from 'vitest';
import type { BoardStreamEvent } from '../src/board/board';
import { RESYNC_DELAY_MILLISECONDS, startBoardFeed } from '../src/board/board-feed';
import { createBoardGateway, type EventSourceLike } from '../src/board/control-plane-board';
import { board, card, ManualClock, OTHER_PROJECT, PROJECT } from './fakes';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sendAnswers(...answers: Response[]) {
  const send = vi.fn<typeof fetch>();
  for (const answer of answers) send.mockResolvedValueOnce(answer);
  return send;
}

const UNAUTHENTICATED = { code: 'forbidden', message: 'No session.', details: { reason: 'unauthenticated' } };

// An EventSource the test drives: it dispatches typed events and records
// whether the adapter closed it.
class FakeEventSource implements EventSourceLike {
  readyState = 0;
  closed = false;
  readonly #listeners = new Map<string, ((event: Event) => void)[]>();

  constructor(readonly url: string) {}

  readonly addEventListener = (type: string, listener: (event: Event) => void) => {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  };

  readonly close = () => {
    this.closed = true;
    this.readyState = 2;
  };

  dispatch(type: string, data?: unknown): void {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data });
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

function streamOf(after = '40') {
  const sources: FakeEventSource[] = [];
  const gateway = createBoardGateway({
    fetch: sendAnswers(),
    openEventSource: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
  });
  const events: BoardStreamEvent[] = [];
  const close = gateway.openEvents('project/1', after, (event) => events.push(event));
  return { source: sources[0]!, events, close };
}

describe('listProjects', () => {
  it('reads every page and keeps only the identifier and the name', async () => {
    const first = { projects: [{ ...PROJECT, createdAt: '2026-11-01T00:00:00.000Z', revision: 1 }], next: PROJECT.projectId };
    const second = { projects: [{ projectId: 'project-2', name: 'Website', createdAt: '2026-11-01T00:00:00.000Z', revision: 3 }] };
    const send = sendAnswers(json(200, first), json(200, second));
    const result = await createBoardGateway({ fetch: send }).listProjects();
    expect(result).toEqual({ kind: 'read', value: [PROJECT, { projectId: 'project-2', name: 'Website' }] });
    expect(send.mock.calls.map(([url]) => url)).toEqual(['/projects', '/projects?after=project-1']);
    expect(send.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'same-origin' });
  });

  it('reads a page that names itself as the next one as unreachable instead of looping', async () => {
    const page = { projects: [PROJECT], next: 'same' };
    const send = sendAnswers(json(200, page), json(200, page));
    expect(await createBoardGateway({ fetch: send }).listProjects()).toEqual({ kind: 'unavailable' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('reads pages whose cursors cycle as unreachable instead of looping', async () => {
    const toB = { projects: [PROJECT], next: 'B' };
    const toA = { projects: [OTHER_PROJECT], next: 'A' };
    const last = { projects: [] };
    const send = sendAnswers(json(200, toA), json(200, toB), json(200, toA), json(200, toB), json(200, last));
    expect(await createBoardGateway({ fetch: send }).listProjects()).toEqual({ kind: 'unavailable' });
    expect(send.mock.calls.map(([url]) => url)).toEqual(['/projects', '/projects?after=A', '/projects?after=B']);
  });

  it.each([
    ['an unauthenticated answer', json(401, UNAUTHENTICATED), 'unauthenticated'],
    ['a 401 without its reason', json(401, { code: 'forbidden' }), 'unavailable'],
    ['a 503', json(503, { code: 'unavailable', message: 'Down.', details: {} }), 'unavailable'],
    ['a body without projects', json(200, { items: [] }), 'unavailable'],
    ['a project without a name', json(200, { projects: [{ projectId: 'p' }] }), 'unavailable'],
    ['a next that is not text', json(200, { projects: [], next: 7 }), 'unavailable'],
    ['an HTML page', new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), 'unavailable'],
  ])('reads %s as %s', async (_, answer, kind) => {
    expect(await createBoardGateway({ fetch: sendAnswers(answer) }).listProjects()).toEqual({ kind });
  });

  it('reads a network failure as unreachable', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await createBoardGateway({ fetch: send }).listProjects()).toEqual({ kind: 'unavailable' });
  });
});

describe('readBoard', () => {
  it('reads the board of the project at its encoded path', async () => {
    const snapshot = board({ cards: [card({ gate: 'stale', waitingFor: 'capacity', end: endOf() })] });
    const send = sendAnswers(json(200, snapshot));
    expect(await createBoardGateway({ fetch: send }).readBoard('project/1')).toEqual({ kind: 'read', value: snapshot });
    expect(send.mock.calls[0]![0]).toBe('/projects/project%2F1/board');
  });

  it.each([
    ['401 unauthenticated', json(401, UNAUTHENTICATED), 'unauthenticated'],
    ['403', json(403, { code: 'forbidden', message: 'No role.', details: { reason: 'role-required' } }), 'denied'],
    ['404', json(404, { code: 'not-found', message: 'No project.', details: {} }), 'not-found'],
    ['500', json(500, { code: 'internal', message: 'Broken.', details: {} }), 'unavailable'],
  ])('reads %s as %s', async (_, answer, kind) => {
    expect(await createBoardGateway({ fetch: sendAnswers(answer) }).readBoard('p')).toEqual({ kind });
  });

  it.each([
    ['no cards array', { ...board(), cards: undefined }],
    ['a position that is not a decimal integer', board({ position: '01' })],
    ['an unreadable asOf', board({ asOf: 'yesterday' })],
    ['a negative workersOnline', board({ workersOnline: -1 })],
    ['no callerMayAct', { ...board(), callerMayAct: 'yes' }],
    ['a card in an unknown column', board({ cards: [card({ column: 'done' as never })] })],
    ['a card with an unknown gate', board({ cards: [card({ gate: 'green' as never })] })],
    ['a card with an unknown wait', board({ cards: [card({ waitingFor: 'luck' as never })] })],
    ['a card with an unknown end', board({ cards: [card({ end: { ...endOf(), kind: 'gone' as never } })] })],
    ['a card with an unknown stage origin', board({ cards: [card({ stage: { stageId: 'a', origin: 'x' as never, state: 'completed' } })] })],
    ['a card without a framework version', board({ cards: [card({ framework: { pluginId: 'openspec' } as never })] })],
    ['an unreachable worker without its last contact', board({ cards: [card({ session: { state: 'worker-unreachable' } as never })] })],
    ['an obstacle of another disposition', board({ cards: [card({ obstacle: { ...obstacleOf(), disposition: 'maybe' } as never })] })],
    ['an obstacle with a broken retry number', board({ cards: [card({ obstacle: { ...obstacleOf(), retryNumber: 'two' } as never })] })],
  ])('reads a board with %s as unreachable', async (_, body) => {
    expect(await createBoardGateway({ fetch: sendAnswers(json(200, body)) }).readBoard('p')).toEqual({ kind: 'unavailable' });
  });

  it('reads a card with an obstacle and an unreachable worker', async () => {
    const reached = card({ obstacle: obstacleOf(), session: { state: 'worker-unreachable', lastContactAt: '2026-11-03T08:00:00.000Z' } });
    const snapshot = board({ cards: [reached] });
    expect(await createBoardGateway({ fetch: sendAnswers(json(200, snapshot)) }).readBoard('p')).toEqual({ kind: 'read', value: snapshot });
  });
});

describe('the project event stream', () => {
  it('opens after the position at the project path and reports open and errors', () => {
    const { source, events } = streamOf('41');
    expect(source.url).toBe('/projects/project%2F1/events?after=41');
    source.dispatch('open');
    source.dispatch('error');
    source.readyState = 2;
    source.dispatch('error');
    expect(events).toEqual([{ kind: 'opened' }, { kind: 'interrupted' }, { kind: 'failed' }]);
  });

  it('reads card and worker changes from their data', () => {
    const { source, events } = streamOf();
    const changed = card({ title: 'Moved' });
    const stamp = { position: '41', occurredAt: '2026-11-03T09:01:00.000Z' };
    source.dispatch('card-changed', JSON.stringify({ type: 'card-changed', ...stamp, card: changed }));
    source.dispatch('board-changed', JSON.stringify({ type: 'board-changed', ...stamp, projectId: 'p', workersOnline: 0 }));
    expect(events).toEqual([
      { kind: 'card-changed', ...stamp, card: changed },
      { kind: 'board-changed', ...stamp, workersOnline: 0 },
    ]);
  });

  it('turns an event it cannot read into a resync, so the board is read again', () => {
    const { source, events } = streamOf();
    source.dispatch('card-changed', '{not json');
    source.dispatch('card-changed', JSON.stringify({ type: 'card-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z', card: {} }));
    source.dispatch('board-changed', JSON.stringify({ type: 'board-changed', position: 'x', occurredAt: 'now', workersOnline: 1 }));
    source.dispatch('card-changed', 42);
    expect(events).toEqual([{ kind: 'resync' }, { kind: 'resync' }, { kind: 'resync' }, { kind: 'resync' }]);
  });

  it('makes the board feed wait longer after each repeated unreadable event', async () => {
    const sources: FakeEventSource[] = [];
    const gateway = createBoardGateway({
      fetch: vi.fn<typeof fetch>(() => Promise.resolve(json(200, board()))),
      openEventSource: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
    });
    const clock = new ManualClock();
    const stop = startBoardFeed({ projectId: PROJECT.projectId, gateway, clock, show: () => {} });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0]!.dispatch('card-changed', '{not json');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1]!.dispatch('card-changed', '{not json');
    expect(sources[1]!.closed).toBe(true);
    await vi.waitFor(() => expect(clock.pendingDelays()).toEqual([RESYNC_DELAY_MILLISECONDS]));
    expect(sources).toHaveLength(2);
    clock.advance(RESYNC_DELAY_MILLISECONDS);
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    stop();
  });

  it('reports resync and stream-ended, and nothing once closed', () => {
    const { source, events, close } = streamOf();
    source.dispatch('resync', JSON.stringify({ type: 'resync', reason: 'cursor-expired' }));
    source.dispatch('stream-ended', JSON.stringify({ type: 'stream-ended', reason: 'role-changed' }));
    close();
    source.dispatch('open');
    expect(source.closed).toBe(true);
    expect(events).toEqual([{ kind: 'resync' }, { kind: 'stream-ended' }]);
  });

  it('uses the browser EventSource by default', () => {
    const opened: string[] = [];
    class BrowserEventSource extends FakeEventSource {
      constructor(url: string) {
        super(url);
        opened.push(url);
      }
    }
    vi.stubGlobal('EventSource', BrowserEventSource);
    try {
      createBoardGateway().openEvents('p', '0', () => {})();
      expect(opened).toEqual(['/projects/p/events?after=0']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function endOf() {
  return {
    kind: 'cancelled' as const,
    taskId: 'task-1',
    attemptId: 'attempt-1',
    outcome: { kind: 'not-started' as const, ownershipGeneration: 1, cancelled: true, endedAt: '2026-11-03T08:00:00.000Z' },
  };
}

function obstacleOf() {
  return {
    taskId: 'task-1',
    observedAt: '2026-11-03T08:30:00.000Z',
    source: 'automatic-retry' as const,
    disposition: 'waiting' as const,
    reason: 'retry-backoff' as const,
    retryNumber: 2,
  };
}
