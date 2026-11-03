import { createApiClient, hasStatus, type ApiRequest } from '../api/client';
import type {
  Board,
  BoardGateway,
  BoardStreamEvent,
  BoardStreamListener,
  Project,
  ReadFailed,
  ReadResult,
  TaskDetail,
} from './board';
import { boardOf, cardChangeOf, failureReason, projectPageOf, requiredRoleOf, workersChangeOf } from './board-wire';
import { taskDetailOf } from './task-detail-wire';

// The board's operations listProjects, readBoard, readTaskDetail, and
// streamProjectEvents, through the typed fetch and the browser's SSE.

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

  async function listProjects(): Promise<ReadResult<readonly Project[]>> {
    const projects: Project[] = [];
    const visited = new Set<string>();
    let after: string | undefined;
    do {
      const result = await reachable(() => request('get', '/projects', { query: { after } }));
      if (result === undefined) return { kind: 'unavailable' };
      if (!hasStatus(result, 200)) return failureOf(result);
      const page = projectPageOf(result.body);
      if (page === undefined || cannotFollow(page.next, visited)) return { kind: 'unavailable' };
      projects.push(...page.projects);
      after = page.next;
      if (after !== undefined) visited.add(after);
    } while (after !== undefined);
    return { kind: 'read', value: projects };
  }

  // A cursor already followed loops, and the limit stops endless new ones.
  function cannotFollow(next: string | undefined, visited: ReadonlySet<string>): boolean {
    return next !== undefined && (visited.has(next) || visited.size + 1 >= MAX_PROJECT_PAGES);
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
    source.addEventListener('resync', () => emit({ kind: 'resync' }));
    source.addEventListener('stream-ended', () => emit({ kind: 'stream-ended' }));
    return () => {
      open = false;
      source.close();
    };
  }

  return { listProjects, readBoard, readTaskDetail, openEvents };
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
