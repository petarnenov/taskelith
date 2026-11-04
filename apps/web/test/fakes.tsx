import { render } from '@testing-library/react';
import { createMemoryRouter, type InitialEntry } from 'react-router';
import { vi } from 'vitest';
import { App } from '../src/App';
import type {
  AgentSession,
  AgentSessionView,
  Board,
  BoardCard,
  BoardGateway,
  BoardStreamEvent,
  BoardStreamListener,
  Project,
  ReadResult,
  TaskDetail,
  TaskView,
  Turn,
  TurnPage,
} from '../src/board/board';
import { APP_BASENAME, appRoutes } from '../src/routes';
import type { Clock } from '../src/session/clock';
import type { LoginOutcome, LogoutOutcome, Operator, SessionGateway, SessionRead } from '../src/session/session';

export const NOW = Date.parse('2026-11-02T10:00:00.000Z');
export const HOUR = 3_600_000;

export const OPERATOR: Operator = { loginName: 'operator', installationRoles: ['installation-owner'], expiresAt: NOW + HOUR };
export const ANONYMOUS: SessionRead = { kind: 'anonymous' };
export const AUTHENTICATED: SessionRead = { kind: 'authenticated', operator: OPERATOR };

interface Timer {
  readonly at: number;
  readonly run: () => void;
  cancelled: boolean;
}

// A clock that moves only when a test advances it.
export class ManualClock implements Clock {
  #now = NOW;
  readonly #timers: Timer[] = [];

  readonly now = () => this.#now;

  readonly schedule = (delayMilliseconds: number, run: () => void) => {
    const timer: Timer = { at: this.#now + delayMilliseconds, run, cancelled: false };
    this.#timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };

  pendingDelays(): number[] {
    return this.#timers.filter((timer) => !timer.cancelled).map((timer) => timer.at - this.#now);
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
    for (const timer of this.#timers.splice(0)) {
      if (timer.cancelled) continue;
      if (timer.at <= this.#now) timer.run();
      else this.#timers.push(timer);
    }
  }
}

export interface FakeGateway extends SessionGateway {
  readonly read: ReturnType<typeof vi.fn<() => Promise<SessionRead>>>;
  readonly logIn: ReturnType<typeof vi.fn<SessionGateway['logIn']>>;
  readonly logOut: ReturnType<typeof vi.fn<() => Promise<LogoutOutcome>>>;
}

export function fakeGateway(firstRead: SessionRead = ANONYMOUS): FakeGateway {
  return {
    read: vi.fn(async () => firstRead),
    logIn: vi.fn(async (): Promise<LoginOutcome> => ({ kind: 'logged-in', operator: OPERATOR })),
    logOut: vi.fn(async (): Promise<LogoutOutcome> => ({ kind: 'logged-out' })),
  };
}

export const PROJECT: Project = { projectId: 'project-1', name: 'Taskelith' };
export const OTHER_PROJECT: Project = { projectId: 'project-2', name: 'Website' };

export function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    runId: 'run-1',
    title: 'Add the board',
    workType: 'feature',
    framework: { pluginId: 'openspec', pluginVersion: '1.3.0' },
    column: 'implement',
    stage: { stageId: 'apply', origin: 'native', state: 'in-progress' },
    session: { state: 'working' },
    integration: 'not-ready',
    needsYou: 0,
    ...overrides,
  };
}

export function board(overrides: Partial<Board> = {}): Board {
  return {
    asOf: '2026-11-03T09:00:00.000Z',
    position: '40',
    projectId: PROJECT.projectId,
    cards: [],
    workersOnline: 1,
    callerMayAct: true,
    ...overrides,
  };
}

export function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    taskId: 'task-1',
    taskRunId: 'task-run-1',
    ownershipGeneration: 2,
    admission: { admissionId: 'admission-1', stageId: 'apply', state: 'used', policyRevision: 'policy-3' },
    session: { state: 'working' },
    ...overrides,
  };
}

export const DIGEST = `sha256:${'ab'.repeat(32)}`;

export function taskDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    asOf: '2026-11-03T09:00:00.000Z',
    position: '40',
    card: card(),
    stages: [
      {
        stageId: 'propose',
        origin: 'native',
        state: 'completed',
        column: 'propose',
        gates: [{ gateId: 'proposal-valid', state: 'passed', requiredEvidence: 'structural-validation' }],
      },
      { stageId: 'apply', origin: 'native', state: 'in-progress', column: 'implement', gates: [] },
    ],
    traceability: [],
    runBinding: {
      pluginId: 'openspec',
      pluginVersion: '1.3.0',
      upstreamToolVersion: '0.9.1',
      workflowId: 'spec-driven',
      workflowVersion: '2',
      workflowDigest: DIGEST,
      configurationRevision: 'config-7',
      policyRevision: 'policy-3',
    },
    tasks: [task()],
    ...overrides,
  };
}

export function agentSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    sessionId: 'session-1',
    taskId: 'task-1',
    runId: 'run-1',
    harness: 'claude-code',
    runningGeneration: 1,
    lastTurnPosition: 2,
    lastRequestPosition: 0,
    output: { lastPosition: 0 },
    ...overrides,
  };
}

export function agentSessionView(overrides: Partial<AgentSessionView> = {}): AgentSessionView {
  return { asOf: '2026-11-03T09:00:00.000Z', position: '40', session: agentSession(), ...overrides };
}

export function turn(overrides: Partial<Turn> = {}): Turn {
  const base = { turnId: 'turn-1', position: 1, author: { kind: 'principal', principalId: 'operator' }, text: 'Start' } as const;
  return { ...base, state: 'ended', generation: 1, outcome: 'completed', ...overrides } as Turn;
}

export function turnPage(overrides: Partial<TurnPage> = {}): TurnPage {
  const turns = [turn(), turn({ turnId: 'turn-2', position: 2, text: 'Continue', state: 'delivered', generation: 1 })];
  return { asOf: '2026-11-03T09:00:00.000Z', position: '40', turns, ...overrides };
}

export interface FakeStream {
  readonly projectId: string;
  readonly after: string;
  readonly emit: (event: BoardStreamEvent) => void;
  readonly isClosed: () => boolean;
}

// A board gateway whose streams the test drives; a closed stream drops
// every event, as the EventSource adapter does.
export class FakeBoardGateway implements BoardGateway {
  readonly streams: FakeStream[] = [];

  readonly listProjects = vi.fn(async (): Promise<ReadResult<readonly Project[]>> => ({ kind: 'read', value: [PROJECT] }));

  readonly readBoard = vi.fn(async (_projectId: string): Promise<ReadResult<Board>> => ({ kind: 'read', value: board() }));

  readonly readTaskDetail = vi.fn(
    async (_projectId: string, _runId: string): Promise<ReadResult<TaskDetail>> => ({ kind: 'read', value: taskDetail() }),
  );

  readonly listAgentSessions = vi.fn(
    async (_projectId: string, _runId: string): Promise<ReadResult<readonly AgentSession[]>> => ({ kind: 'read', value: [] }),
  );

  readonly readAgentSession = vi.fn(
    async (_projectId: string, _sessionId: string): Promise<ReadResult<AgentSessionView>> => ({
      kind: 'read',
      value: agentSessionView(),
    }),
  );

  readonly listAgentSessionTurns = vi.fn(
    async (_projectId: string, _sessionId: string, _after: number): Promise<ReadResult<TurnPage>> => ({
      kind: 'read',
      value: turnPage(),
    }),
  );

  readonly openEvents = (projectId: string, after: string, listener: BoardStreamListener) => {
    let closed = false;
    this.streams.push({
      projectId,
      after,
      emit: (event) => {
        if (!closed) listener(event);
      },
      isClosed: () => closed,
    });
    return () => {
      closed = true;
    };
  };

  lastStream(): FakeStream {
    const stream = this.streams.at(-1);
    if (stream === undefined) throw new Error('No stream was opened.');
    return stream;
  }

  openStreams(): FakeStream[] {
    return this.streams.filter((stream) => !stream.isClosed());
  }
}

export function renderApp(
  path: InitialEntry,
  gateway: SessionGateway = fakeGateway(AUTHENTICATED),
  clock = new ManualClock(),
  boardGateway: BoardGateway = new FakeBoardGateway(),
) {
  const router = createMemoryRouter(appRoutes(), { basename: APP_BASENAME, initialEntries: [path] });
  const view = render(<App router={router} gateway={gateway} board={boardGateway} clock={clock} />);
  return { ...view, router, gateway, clock, boardGateway };
}
