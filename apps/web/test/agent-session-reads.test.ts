import { describe, expect, it, vi } from 'vitest';
import type { BoardStreamEvent } from '../src/board/board';
import { createBoardGateway, MAX_PAGES, type EventSourceLike } from '../src/board/control-plane-board';
import { agentSession, agentSessionView, turn, turnPage } from './fakes';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sendAnswers(...answers: Response[]) {
  const send = vi.fn<typeof fetch>();
  for (const answer of answers) send.mockResolvedValueOnce(answer);
  return send;
}

const DENIED = { code: 'forbidden', message: 'Role needed.', details: { reason: 'role-required', requiredRole: 'project-viewer' } };
const NOT_FOUND = { code: 'not-found', message: 'Unknown.', details: {} };
const STAMP = { asOf: '2026-11-03T09:00:00.000Z', position: '40' };

describe('listAgentSessions', () => {
  it('reads every page of the card at its encoded path', async () => {
    const first = { ...STAMP, sessions: [agentSession({ runId: 'run.1' })], next: 'session-1' };
    const second = { ...STAMP, sessions: [agentSession({ runId: 'run.1', sessionId: 'session-2', taskId: 'task-2' })] };
    const send = sendAnswers(json(200, first), json(200, second));
    const result = await createBoardGateway({ fetch: send }).listAgentSessions('project/1', 'run.1');
    expect(result).toEqual({ kind: 'read', value: [...first.sessions, ...second.sessions] });
    expect(send.mock.calls.map(([url]) => url)).toEqual([
      '/projects/project%2F1/cards/run.1/agent-sessions',
      '/projects/project%2F1/cards/run.1/agent-sessions?after=session-1',
    ]);
  });

  it('reads a session of another card as unreachable', async () => {
    const send = sendAnswers(json(200, { ...STAMP, sessions: [agentSession({ runId: 'run-2' })] }));
    expect(await createBoardGateway({ fetch: send }).listAgentSessions('project-1', 'run-1')).toEqual({ kind: 'unavailable' });
  });

  it('reads pages whose cursor repeats as unreachable instead of looping', async () => {
    const page = { ...STAMP, sessions: [agentSession()], next: 'same' };
    const send = sendAnswers(json(200, page), json(200, page));
    expect(await createBoardGateway({ fetch: send }).listAgentSessions('project-1', 'run-1')).toEqual({ kind: 'unavailable' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('reads a server that keeps naming new cursors as unreachable after the page limit', async () => {
    let pages = 0;
    const send = vi.fn<typeof fetch>(async () => {
      pages += 1;
      return json(200, { ...STAMP, sessions: [], next: `page-${pages}` });
    });
    expect(await createBoardGateway({ fetch: send }).listAgentSessions('project-1', 'run-1')).toEqual({ kind: 'unavailable' });
    expect(send).toHaveBeenCalledTimes(MAX_PAGES);
  });

  it.each([
    ['a 403 with its role', json(403, DENIED), { kind: 'denied', requiredRole: 'project-viewer' }],
    ['a 404', json(404, NOT_FOUND), { kind: 'not-found' }],
    ['a body without sessions', json(200, { ...STAMP }), { kind: 'unavailable' }],
    ['a session without a harness', json(200, { ...STAMP, sessions: [{ ...agentSession(), harness: '' }] }), { kind: 'unavailable' }],
    ['a next that is not text', json(200, { ...STAMP, sessions: [], next: 7 }), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, failure) => {
    expect(await createBoardGateway({ fetch: sendAnswers(answer) }).listAgentSessions('project-1', 'run-1')).toEqual(failure);
  });
});

describe('readAgentSession', () => {
  it('reads the session at its encoded path with every optional field', async () => {
    const session = agentSession({
      sessionId: 'session.1',
      limit: { resetsAt: '2026-11-03T10:00:00.000Z' },
      activeAttempt: { attemptId: 'attempt-1', ownershipGeneration: 2 },
      output: { lastPosition: 9, earliestRetained: 3 },
      handoff: {
        resetsAt: '2026-11-03T10:00:00.000Z',
        lastTurnWithOutcome: 'turn-1',
        unresolvedRequests: [{ generation: 1, nativeRequestId: 'request-1' }],
        evidence: 'Account limit reached.',
        takenBy: 'session-2',
      },
    });
    const view = agentSessionView({ session });
    const send = sendAnswers(json(200, view));
    expect(await createBoardGateway({ fetch: send }).readAgentSession('project/1', 'session.1')).toEqual({ kind: 'read', value: view });
    expect(send.mock.calls[0]![0]).toBe('/projects/project%2F1/agent-sessions/session.1');
  });

  it('reads another session than the one asked for as unreachable', async () => {
    const send = sendAnswers(json(200, agentSessionView({ session: agentSession({ sessionId: 'session-2' }) })));
    expect(await createBoardGateway({ fetch: send }).readAgentSession('project-1', 'session-1')).toEqual({ kind: 'unavailable' });
  });

  const withSession = (session: object) => json(200, agentSessionView({ session: session as never }));

  it.each([
    ['a 404', json(404, NOT_FOUND), { kind: 'not-found' }],
    ['a 403 without its role', json(403, { code: 'forbidden', message: 'No.', details: {} }), { kind: 'denied' }],
    ['a network failure', undefined, { kind: 'unavailable' }],
    ['a view without asOf', json(200, { position: '40', session: agentSession() }), { kind: 'unavailable' }],
    ['a running generation of 0', withSession(agentSession({ runningGeneration: 0 })), { kind: 'unavailable' }],
    ['a limit that is not a record', withSession({ ...agentSession(), limit: 'soon' }), { kind: 'unavailable' }],
    ['a limit with an unreadable reset time', withSession(agentSession({ limit: { resetsAt: 'later' } })), { kind: 'unavailable' }],
    ['an attempt without its generation', withSession({ ...agentSession(), activeAttempt: { attemptId: 'a' } }), { kind: 'unavailable' }],
    ['an output window without its last position', withSession({ ...agentSession(), output: {} }), { kind: 'unavailable' }],
    ['an earliest retained position of 0', withSession(agentSession({ output: { lastPosition: 1, earliestRetained: 0 } })), { kind: 'unavailable' }],
    ['a handoff without evidence', withSession({ ...agentSession(), handoff: { unresolvedRequests: [] } }), { kind: 'unavailable' }],
    ['a handoff with an unreadable request key', withSession({ ...agentSession(), handoff: { evidence: 'e', unresolvedRequests: [{}] } }), { kind: 'unavailable' }],
    ['a handoff with an unreadable reset time', withSession({ ...agentSession(), handoff: { evidence: 'e', unresolvedRequests: [], resetsAt: 'x' } }), { kind: 'unavailable' }],
    ['a handoff taken by no text', withSession({ ...agentSession(), handoff: { evidence: 'e', unresolvedRequests: [], takenBy: 7 } }), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, failure) => {
    const send = answer === undefined ? vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')) : sendAnswers(answer);
    expect(await createBoardGateway({ fetch: send }).readAgentSession('project-1', 'session-1')).toEqual(failure);
  });
});

describe('listAgentSessionTurns', () => {
  it('reads one page of turns above the cursor at its encoded path', async () => {
    const page = turnPage({ next: 2 });
    const send = sendAnswers(json(200, page));
    const result = await createBoardGateway({ fetch: send }).listAgentSessionTurns('project/1', 'session.1', 0);
    expect(result).toEqual({ kind: 'read', value: page });
    expect(send.mock.calls[0]![0]).toBe('/projects/project%2F1/agent-sessions/session.1/turns?after=0');
  });

  it('reads every turn shape the contract allows', async () => {
    const host = { kind: 'host', delegationRequest: { generation: 1, nativeRequestId: 'request-1' } } as const;
    const turns = [
      turn({ state: 'queued' }),
      turn({ turnId: 'turn-2', position: 2, state: 'outcome-unknown', generation: 1 }),
      turn({ turnId: 'turn-3', position: 3, state: 'refused', generation: 2, author: host }),
      turn({ turnId: 'turn-4', position: 4, state: 'ended', generation: 2, outcome: 'failed', failure: 'transport' }),
    ];
    const send = sendAnswers(json(200, turnPage({ turns })));
    const result = await createBoardGateway({ fetch: send }).listAgentSessionTurns('project-1', 'session-1', 0);
    expect(result).toEqual({ kind: 'read', value: turnPage({ turns }) });
  });

  it('reads a turn at or below the cursor as unreachable', async () => {
    const send = sendAnswers(json(200, turnPage()));
    expect(await createBoardGateway({ fetch: send }).listAgentSessionTurns('project-1', 'session-1', 1)).toEqual({ kind: 'unavailable' });
  });

  const withTurns = (turns: readonly object[]) => json(200, turnPage({ turns: turns as never }));

  it.each([
    ['a 404', json(404, NOT_FOUND), { kind: 'not-found' }],
    ['a 503', json(503, { code: 'unavailable', message: 'Down.', details: {} }), { kind: 'unavailable' }],
    ['a page without turns', json(200, { ...STAMP }), { kind: 'unavailable' }],
    ['a next that is not a position', json(200, { ...turnPage(), next: 'x' }), { kind: 'unavailable' }],
    ['a turn at position 0', withTurns([turn({ position: 0 })]), { kind: 'unavailable' }],
    ['a turn of an unknown state', withTurns([{ ...turn(), state: 'sent' }]), { kind: 'unavailable' }],
    ['a delivered turn without its generation', withTurns([{ ...turn({ state: 'delivered' }), generation: undefined }]), { kind: 'unavailable' }],
    ['an ended turn of an unknown outcome', withTurns([{ ...turn(), outcome: 'done' }]), { kind: 'unavailable' }],
    ['a failed turn of an unknown failure', withTurns([{ ...turn(), outcome: 'failed', failure: 'weather' }]), { kind: 'unavailable' }],
    ['a turn without text', withTurns([{ ...turn(), text: undefined }]), { kind: 'unavailable' }],
    ['a turn of an unknown author kind', withTurns([turn({ author: { kind: 'robot' } as never })]), { kind: 'unavailable' }],
    ['a host turn without its request key', withTurns([turn({ author: { kind: 'host' } as never })]), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, failure) => {
    expect(await createBoardGateway({ fetch: sendAnswers(answer) }).listAgentSessionTurns('project-1', 'session-1', 0)).toEqual(failure);
  });
});

// The OpenAPI schemas cap TimelineCursor, TimelinePosition, and
// AgentSessionGeneration at the largest safe integer, from 0 or from 1.
describe('the timeline numbers', () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const sessionWith = (fields: object) => json(200, agentSessionView({ session: { ...agentSession(), ...fields } as never }));
  const pageWith = (fields: object) => json(200, { ...turnPage(), ...fields });
  const gatewayOf = (answer: Response) => createBoardGateway({ fetch: sendAnswers(answer) });

  it.each([
    ['a last turn position', (value: number) => sessionWith({ lastTurnPosition: value }), 0],
    ['a last request position', (value: number) => sessionWith({ lastRequestPosition: value }), 0],
    ['an output position', (value: number) => sessionWith({ output: { lastPosition: value } }), 0],
    ['an earliest retained position', (value: number) => sessionWith({ output: { lastPosition: MAX, earliestRetained: value } }), 1],
    ['a running generation', (value: number) => sessionWith({ runningGeneration: value }), 1],
    ['an ownership generation', (value: number) => sessionWith({ activeAttempt: { attemptId: 'a', ownershipGeneration: value } }), 1],
  ])('reads %s from its lowest value to the largest safe integer, and one above it as unreachable', async (_, answerWith, lowest) => {
    const readOf = async (value: number) => (await gatewayOf(answerWith(value)).readAgentSession('project-1', 'session-1')).kind;
    expect(await readOf(lowest)).toBe('read');
    expect(await readOf(MAX)).toBe('read');
    expect(await readOf(MAX + 1)).toBe('unavailable');
  });

  it.each([
    ['a turn position', (value: number) => pageWith({ turns: [turn({ position: value })] }), 1],
    ['a turn generation', (value: number) => pageWith({ turns: [turn({ generation: value })] }), 1],
    ['a request generation', (value: number) => pageWith({ turns: [turn({ author: { kind: 'host', delegationRequest: { generation: value, nativeRequestId: 'r' } } })] }), 1],
    ['a next cursor', (value: number) => pageWith({ next: value }), 1],
  ])('reads %s from its lowest value to the largest safe integer, and one above it as unreachable', async (_, answerWith, lowest) => {
    const readOf = async (value: number) => (await gatewayOf(answerWith(value)).listAgentSessionTurns('project-1', 'session-1', 0)).kind;
    expect(await readOf(lowest)).toBe('read');
    expect(await readOf(MAX)).toBe('read');
    expect(await readOf(MAX + 1)).toBe('unavailable');
  });
});

// An EventSource the test drives: it dispatches typed events.
class FakeEventSource implements EventSourceLike {
  readyState = 0;
  readonly #listeners = new Map<string, ((event: Event) => void)[]>();

  readonly addEventListener = (type: string, listener: (event: Event) => void) => {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  };

  readonly close = () => {
    this.readyState = 2;
  };

  dispatch(type: string, data: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(new MessageEvent(type, { data }));
  }
}

function streamOf() {
  const source = new FakeEventSource();
  const gateway = createBoardGateway({ fetch: sendAnswers(), openEventSource: () => source });
  const events: BoardStreamEvent[] = [];
  gateway.openEvents('project-1', '40', (event) => events.push(event));
  return { source, events };
}

describe('the session events of the stream', () => {
  it('delivers a session change and a turn change with their stamps', () => {
    const { source, events } = streamOf();
    const stamp = { position: '41', occurredAt: '2026-11-03T09:01:00.000Z' };
    source.dispatch('agent-session-changed', JSON.stringify({ type: 'agent-session-changed', ...stamp, session: agentSession() }));
    source.dispatch('turn-changed', JSON.stringify({ type: 'turn-changed', ...stamp, sessionId: 'session-1', turn: turn() }));
    expect(events).toEqual([
      { kind: 'agent-session-changed', ...stamp, session: agentSession() },
      { kind: 'turn-changed', ...stamp, sessionId: 'session-1', turn: turn() },
    ]);
  });

  it.each([
    ['a session change without its session', 'agent-session-changed', { type: 'agent-session-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z' }],
    ['a session change of another type', 'agent-session-changed', { type: 'turn-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z', session: agentSession() }],
    ['a turn change without its session identifier', 'turn-changed', { type: 'turn-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z', turn: turn() }],
    ['a turn change with an unreadable turn', 'turn-changed', { type: 'turn-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z', sessionId: 's', turn: {} }],
    ['a turn change that is not JSON', 'turn-changed', undefined],
  ])('reads %s as a resync that names the unreadable frame', (_, type, data) => {
    const { source, events } = streamOf();
    source.dispatch(type, data === undefined ? '{' : JSON.stringify(data));
    expect(events).toEqual([{ kind: 'resync', unreadable: type }]);
  });
});
