import {
  agentSessionPageOf,
  agentSessionViewOf,
  sessionChangeOf,
  turnChangeOf,
  turnPageOf,
} from '../agent-session/agent-session-wire';
import { createApiClient, hasStatus, type ApiRequest } from '../api/client';
import type {
  AgentSession,
  AgentSessionView,
  Board,
  BoardGateway,
  BoardStreamEvent,
  BoardStreamListener,
  Project,
  ReadFailed,
  ReadResult,
  TaskDetail,
  TurnPage,
} from './board';
import { boardOf, cardChangeOf, failureReason, projectPageOf, requiredRoleOf, workersChangeOf } from './board-wire';
import { taskDetailOf } from './task-detail-wire';

// The board's reads, the agent session reads, and streamProjectEvents,
// through the typed fetch and the browser's SSE.

export interface EventSourceLike {
  readonly readyState: number;
  readonly addEventListener: (type: string, listener: (event: Event) => void) => void;
  readonly close: () => void;
}

export type OpenEventSource = (url: string) => EventSourceLike;

// EventSource.CLOSED: the browser gave up and will not reconnect.
const CLOSED = 2;

// An event the SPA cannot read makes the board read its snapshot again.
const UNREADABLE: BoardStreamEvent = { kind: 'resync' };

// A server that names new cursors beyond this many pages reads as unreachable.
export const MAX_PROJECT_PAGES = 100;

interface Page<T> {
  readonly items: readonly T[];
  readonly next?: string;
}

// An answer as the typed fetch returns it, whatever its operation.
interface Answer {
  readonly status: number;
  readonly body: unknown;
}

interface BoardGatewayOptions {
  readonly fetch?: typeof fetch;
  readonly openEventSource?: OpenEventSource;
}

export function createBoardGateway({
  fetch: send,
  openEventSource = (url) => new EventSource(url),
}: BoardGatewayOptions = {}): BoardGateway {
  // Every board operation is a GET, so no request carries a CSRF token.
  const request: ApiRequest = createApiClient({ csrfToken: () => undefined, fetch: send });

  function listProjects(): Promise<ReadResult<readonly Project[]>> {
    return readPages(
      (after) => request('get', '/projects', { query: { after } }),
      (body) => {
        const page = projectPageOf(body);
        return page === undefined ? undefined : { items: page.projects, next: page.next };
      },
    );
  }

  // The sessions of a card's tasks, every page; a session of another card
  // than the one asked for is a wrong answer.
  function listAgentSessions(projectId: string, runId: string): Promise<ReadResult<readonly AgentSession[]>> {
    const path = { projectId, runId };
    return readPages(
      (after) => request('get', '/projects/{projectId}/cards/{runId}/agent-sessions', { path, query: { after } }),
      (body) => {
        const page = agentSessionPageOf(body);
        if (page === undefined || !page.sessions.every((session) => session.runId === runId)) return undefined;
        return { items: page.sessions, next: page.next };
      },
    );
  }

  // Follows a paged read to its end; a cursor already followed loops, and
  // the page limit stops endless new ones, so both read as unreachable.
  async function readPages<T>(
    send: (after: string | undefined) => Promise<Answer>,
    pageOf: (body: unknown) => Page<T> | undefined,
  ): Promise<ReadResult<readonly T[]>> {
    const items: T[] = [];
    const visited = new Set<string>();
    let after: string | undefined;
    do {
      const result = await reachable(() => send(after));
      if (result === undefined) return { kind: 'unavailable' };
      if (result.status !== 200) return failureOf(result);
      const page = pageOf(result.body);
      if (page === undefined || cannotFollow(page.next, visited)) return { kind: 'unavailable' };
      items.push(...page.items);
      after = page.next;
      if (after !== undefined) visited.add(after);
    } while (after !== undefined);
    return { kind: 'read', value: items };
  }

  function cannotFollow(next: string | undefined, visited: ReadonlySet<string>): boolean {
    return next !== undefined && (visited.has(next) || visited.size + 1 >= MAX_PROJECT_PAGES);
  }

  // A session other than the one asked for is a wrong answer.
  async function readAgentSession(projectId: string, sessionId: string): Promise<ReadResult<AgentSessionView>> {
    const path = { projectId, sessionId };
    const result = await reachable(() => request('get', '/projects/{projectId}/agent-sessions/{sessionId}', { path }));
    if (result === undefined) return { kind: 'unavailable' };
    if (!hasStatus(result, 200)) return failureOf(result);
    const view = agentSessionViewOf(result.body);
    return view?.session.sessionId === sessionId ? { kind: 'read', value: view } : { kind: 'unavailable' };
  }

  // One page of turns above the cursor; a turn at or below it is wrong.
  async function listAgentSessionTurns(projectId: string, sessionId: string, after: number): Promise<ReadResult<TurnPage>> {
    const path = { projectId, sessionId };
    const query = { after };
    const result = await reachable(() =>
      request('get', '/projects/{projectId}/agent-sessions/{sessionId}/turns', { path, query }),
    );
    if (result === undefined) return { kind: 'unavailable' };
    if (!hasStatus(result, 200)) return failureOf(result);
    const page = turnPageOf(result.body);
    const above = page !== undefined && page.turns.every((turn) => turn.position > after);
    return above ? { kind: 'read', value: page } : { kind: 'unavailable' };
  }

  async function readBoard(projectId: string): Promise<ReadResult<Board>> {
    const result = await reachable(() => request('get', '/projects/{projectId}/board', { path: { projectId } }));
    if (result === undefined) return { kind: 'unavailable' };
    if (!hasStatus(result, 200)) return failureOf(result);
    const board = boardOf(result.body);
    return board === undefined ? { kind: 'unavailable' } : { kind: 'read', value: board };
  }

  // A detail of another card than the one asked for is a wrong answer.
  async function readTaskDetail(projectId: string, runId: string): Promise<ReadResult<TaskDetail>> {
    const path = { projectId, runId };
    const result = await reachable(() => request('get', '/projects/{projectId}/cards/{runId}', { path }));
    if (result === undefined) return { kind: 'unavailable' };
    if (!hasStatus(result, 200)) return failureOf(result);
    const detail = taskDetailOf(result.body);
    return detail?.card.runId === runId ? { kind: 'read', value: detail } : { kind: 'unavailable' };
  }

  function openEvents(projectId: string, after: string, listener: BoardStreamListener): () => void {
    const url = `/projects/${encodeURIComponent(projectId)}/events?after=${encodeURIComponent(after)}`;
    const source = openEventSource(url);
    let open = true;
    const emit = (event: BoardStreamEvent) => {
      if (open) listener(event);
    };
    source.addEventListener('open', () => emit({ kind: 'opened' }));
    source.addEventListener('error', () => emit({ kind: source.readyState === CLOSED ? 'failed' : 'interrupted' }));
    source.addEventListener('card-changed', (event) => emit(cardChangeOf(dataOf(event)) ?? UNREADABLE));
    source.addEventListener('board-changed', (event) => emit(workersChangeOf(dataOf(event)) ?? UNREADABLE));
    source.addEventListener('agent-session-changed', (event) => emit(sessionChangeOf(dataOf(event)) ?? UNREADABLE));
    source.addEventListener('turn-changed', (event) => emit(turnChangeOf(dataOf(event)) ?? UNREADABLE));
    source.addEventListener('resync', () => emit({ kind: 'resync' }));
    source.addEventListener('stream-ended', () => emit({ kind: 'stream-ended' }));
    return () => {
      open = false;
      source.close();
    };
  }

  return { listProjects, readBoard, readTaskDetail, listAgentSessions, readAgentSession, listAgentSessionTurns, openEvents };
}

function failureOf({ status, body }: { readonly status: number; readonly body: unknown }): ReadFailed {
  if (status === 401) return { kind: failureReason(body) === 'unauthenticated' ? 'unauthenticated' : 'unavailable' };
  if (status === 403) return denialOf(requiredRoleOf(body));
  if (status === 404) return { kind: 'not-found' };
  return { kind: 'unavailable' };
}

function denialOf(requiredRole: string | undefined): ReadFailed {
  return requiredRole === undefined ? { kind: 'denied' } : { kind: 'denied', requiredRole };
}

function dataOf(event: Event): unknown {
  const { data } = event as MessageEvent<unknown>;
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

// A network failure or an unreadable body reaches no documented status.
async function reachable<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}
