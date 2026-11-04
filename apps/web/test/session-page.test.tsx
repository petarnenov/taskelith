import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReadResult, TaskDetail, TurnPage } from '../src/board/board';
import { formatInstant } from '../src/board/board-labels';
import { identifierOf, sessionPath } from '../src/screens';
import {
  agentSession,
  agentSessionView,
  AUTHENTICATED,
  card,
  FakeBoardGateway,
  fakeGateway,
  ManualClock,
  PROJECT,
  renderApp,
  task,
  taskDetail,
  turn,
  turnPage,
} from './fakes';

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const SESSION_PATH = '/app/sessions/project-1/session-1';
const DETAIL_PATH = '/app/projects/project-1/cards/run-1';

// A promise the test resolves when it chooses, so no read races it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function openSession(gateway = new FakeBoardGateway(), path = SESSION_PATH) {
  return renderApp(path, fakeGateway(AUTHENTICATED), new ManualClock(), gateway);
}

async function shownSession() {
  await screen.findByRole('heading', { level: 1, name: 'Agent session session-1' });
  return within(await screen.findByRole('region', { name: 'Turns' }));
}

// The turn entries of the timeline, in the order shown.
function turnEntries(): HTMLElement[] {
  return [...screen.getByRole('region', { name: 'Turns' }).querySelectorAll<HTMLElement>('[data-turn]')];
}

// The text of the alert whose title is shown.
async function alertNamed(title: string): Promise<string> {
  const heading = await screen.findByText(title);
  return heading.closest('[role="alert"]')?.textContent ?? '';
}

function indicator(): HTMLElement {
  const element = screen.getByRole('main').querySelector('[data-indicator]');
  if (!(element instanceof HTMLElement)) throw new Error('No indicator is shown.');
  return element;
}

const at = (position: string) => ({ position, occurredAt: '2026-11-03T09:01:00.000Z' });

// Runs a test while the system asks for reduced motion.
async function withReducedMotion(run: () => Promise<void>): Promise<void> {
  const matchMedia = window.matchMedia;
  const reduced = (query: string) => ({ ...matchMedia(query), matches: query.includes('prefers-reduced-motion') });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: reduced });
  try {
    await run();
  } finally {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
  }
}

describe('the sessions index', () => {
  it('says that a session opens from its task, lists none, and leads to the board', async () => {
    const view = openSession(new FakeBoardGateway(), '/app/sessions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent sessions' })).toBeDefined();
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('An agent session opens from its task');
    expect(main.textContent).not.toContain('it shows no data');
    expect(view.boardGateway.readAgentSession).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('link', { name: 'Go to the board' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Project board' })).toBeDefined();
  });
});

describe('the session address', () => {
  it.each([
    ['run/1 a', '/sessions/project-1/run~2F1~20a'],
    ['session.1', '/sessions/project-1/session~2E1'],
    ['session-1', '/sessions/project-1/session-1'],
  ])('writes the session %s route-safe as %s and reads it back', (sessionId, path) => {
    expect(sessionPath(PROJECT.projectId, sessionId)).toBe(path);
    expect(identifierOf(path.split('/')[3]!)).toBe(sessionId);
  });

  it('opens the session of an address with a dot', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session: agentSession({ sessionId: 'session.1' }) }) });
    openSession(gateway, '/app/sessions/project~2E1/session~2E1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent session session.1' })).toBeDefined();
    expect(gateway.readAgentSession).toHaveBeenCalledWith('project.1', 'session.1');
  });
});

describe('the task detail session links', () => {
  function gatewayWith(sessions: ReadResult<readonly ReturnType<typeof agentSession>[]>) {
    const gateway = new FakeBoardGateway();
    gateway.listAgentSessions.mockResolvedValue(sessions);
    // Each read answers a new detail, as the control plane's bodies do.
    gateway.readTaskDetail.mockImplementation(async () => ({ kind: 'read', value: taskDetail({ tasks: [task(), task({ taskId: 'task-2' })] }) }));
    return gateway;
  }

  it('links each task to its sessions, listed with the task detail, and names the harness', async () => {
    const sessions = [agentSession(), agentSession({ sessionId: 'session.2', taskId: 'task-2', harness: 'codex' })];
    const view = openSession(gatewayWith({ kind: 'read', value: sessions }), DETAIL_PATH);
    const link = await screen.findByRole('link', { name: 'Open the claude-code session session-1' });
    expect(link.getAttribute('href')).toBe(SESSION_PATH);
    const second = screen.getByRole('link', { name: 'Open the codex session session.2' });
    expect(second.getAttribute('href')).toBe('/app/sessions/project-1/session~2E2');
    const items = within(screen.getByRole('region', { name: 'Tasks in admission order' })).getAllByRole('listitem');
    expect(within(items[0]!).getAllByRole('link')).toHaveLength(1);
    expect(within(items[1]!).getAllByRole('link')).toHaveLength(1);
    expect(view.boardGateway.listAgentSessions).toHaveBeenCalledWith(PROJECT.projectId, 'run-1');
    await userEvent.click(link);
    await shownSession();
    expect(view.router.state.location.pathname).toBe(SESSION_PATH);
  });

  it('says that it looks the sessions up until they answer, and lists them again with a new task detail', async () => {
    const held = deferred<ReadResult<readonly ReturnType<typeof agentSession>[]>>();
    const gateway = gatewayWith({ kind: 'read', value: [agentSession()] });
    gateway.listAgentSessions.mockReturnValueOnce(held.promise);
    openSession(gateway, DETAIL_PATH);
    const tasks = within(await screen.findByRole('region', { name: 'Tasks in admission order' }));
    expect(tasks.getByText('Looking up the agent sessions…')).toBeDefined();
    expect(tasks.queryByRole('link')).toBeNull();
    await act(async () => held.resolve({ kind: 'read', value: [] }));
    expect(tasks.queryByText('Looking up the agent sessions…')).toBeNull();
    act(() => gateway.lastStream().emit({ kind: 'card-changed', ...at('41'), card: card({ title: 'Changed' }) }));
    expect(await screen.findByRole('link', { name: 'Open the claude-code session session-1' })).toBeDefined();
    expect(gateway.listAgentSessions).toHaveBeenCalledTimes(2);
  });

  it('shows why the sessions could not be listed, with the role a 403 names, and a retry', async () => {
    const gateway = gatewayWith({ kind: 'denied', requiredRole: 'project-viewer' });
    openSession(gateway, DETAIL_PATH);
    expect(await alertNamed('The agent sessions cannot be listed')).toContain('Reading it needs the role project-viewer.');
    gateway.listAgentSessions.mockResolvedValue({ kind: 'read', value: [agentSession()] });
    const tasks = within(screen.getByRole('region', { name: 'Tasks in admission order' }));
    await userEvent.click(tasks.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Open the claude-code session session-1' })).toBeDefined();
    expect(screen.queryByText('The agent sessions cannot be listed')).toBeNull();
  });
});

describe('the session page', () => {
  it('shows that it loads until the session answers, then the session, its task, and its run link', async () => {
    const gateway = new FakeBoardGateway();
    const held = deferred<ReadResult<TurnPage>>();
    gateway.listAgentSessionTurns.mockReturnValueOnce(held.promise);
    openSession(gateway);
    expect(await screen.findByText('Loading the agent session…')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Turns' })).toBeNull();
    await act(async () => held.resolve({ kind: 'read', value: turnPage() }));
    await shownSession();
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('Harness claude-code · task task-1 · run run-1');
    expect(screen.getByRole('link', { name: 'run-1' }).getAttribute('href')).toBe(DETAIL_PATH);
    expect(main.textContent).toContain('Generation 1 runs');
    expect(screen.queryByText('Loading the agent session…')).toBeNull();
  });

  it('shows the session facts: no running generation, the attempt, the limit, and the handoff', async () => {
    const gateway = new FakeBoardGateway();
    const session = agentSession({
      runningGeneration: undefined,
      activeAttempt: { attemptId: 'attempt-1', ownershipGeneration: 2 },
      limit: { resetsAt: '2026-11-03T10:00:00.000Z' },
      handoff: { unresolvedRequests: [], evidence: 'Account limit reached.', takenBy: 'session-2' },
    });
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session }) });
    openSession(gateway);
    await shownSession();
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('No generation runs · attempt attempt-1, ownership generation 2');
    expect(main.textContent).toContain(`Account limit reached, resets at ${formatInstant('2026-11-03T10:00:00.000Z')}`);
    expect(main.textContent).toContain('Handoff: Account limit reached., taken by session session-2');
  });

  it('shows a limit without a reset time and a handoff taken by no session', async () => {
    const gateway = new FakeBoardGateway();
    const session = agentSession({ limit: {}, handoff: { unresolvedRequests: [], evidence: 'Limit.' } });
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session }) });
    openSession(gateway);
    await shownSession();
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('Account limit reachedHandoff: Limit.');
    expect(main.textContent).not.toContain('resets at');
  });

  it('lists the turns in position order with their author, state, generation, and lines', async () => {
    const gateway = new FakeBoardGateway();
    const host = { kind: 'host', delegationRequest: { generation: 2, nativeRequestId: 'request-1' } } as const;
    const turns = [
      turn({ turnId: 'turn-3', position: 3, state: 'queued', text: 'Third' }),
      turn({ turnId: 'turn-1', position: 1, text: 'First line\nSecond line' }),
      turn({ turnId: 'turn-2', position: 2, author: host, state: 'ended', generation: 2, outcome: 'failed', failure: 'transport' }),
    ];
    gateway.listAgentSessionTurns.mockResolvedValue({ kind: 'read', value: turnPage({ turns }) });
    openSession(gateway);
    const region = await shownSession();
    const items = turnEntries();
    expect(items.map((item) => item.textContent)).toEqual([
      '#1 operatorcompletedgeneration 1First lineSecond line',
      '#2 host, for delegation request request-1 of generation 2failed: transportgeneration 2Start',
      '#3 operatorqueued, delivered at the next turn boundaryThird',
    ]);
    expect(within(items[0]!).getByText('First line')).toBeDefined();
    expect(within(items[0]!).getByText('Second line')).toBeDefined();
    expect(region.queryByText('Load earlier turns', { exact: false })).toBeNull();
  });

  it('says that the session has no turn yet', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session: agentSession({ lastTurnPosition: 0 }) }) });
    gateway.listAgentSessionTurns.mockResolvedValue({ kind: 'read', value: turnPage({ turns: [] }) });
    openSession(gateway);
    const region = await shownSession();
    expect(region.getByText('No turn yet.')).toBeDefined();
  });

  it('applies a turn change and a session change of the stream', async () => {
    const gateway = new FakeBoardGateway();
    openSession(gateway);
    const region = await shownSession();
    act(() => {
      const stream = gateway.lastStream();
      stream.emit({ kind: 'turn-changed', ...at('41'), sessionId: 'session-1', turn: turn({ turnId: 'turn-3', position: 3, text: 'Third' }) });
      stream.emit({ kind: 'agent-session-changed', ...at('42'), session: agentSession({ runningGeneration: 2, lastTurnPosition: 3 }) });
    });
    expect(turnEntries()).toHaveLength(3);
    expect(region.getByText('Third')).toBeDefined();
    expect(screen.getByRole('main').textContent).toContain('Generation 2 runs');
  });
});

describe('earlier turns', () => {
  // Turns at the positions from first to last, in order.
  const turnsAt = (first: number, last: number) =>
    Array.from({ length: last - first + 1 }, (_, offset) => turn({ turnId: `turn-${first + offset}`, position: first + offset, text: `Turn ${first + offset}` }));

  function windowed() {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session: agentSession({ lastTurnPosition: 150 }) }) });
    gateway.listAgentSessionTurns.mockResolvedValueOnce({ kind: 'read', value: turnPage({ turns: turnsAt(51, 150) }) });
    return gateway;
  }

  it('shows the last window with a button that loads the earlier one, and says while it loads', async () => {
    const gateway = windowed();
    const held = deferred<ReadResult<TurnPage>>();
    gateway.listAgentSessionTurns.mockReturnValueOnce(held.promise);
    openSession(gateway);
    const region = await shownSession();
    expect(turnEntries()).toHaveLength(100);
    expect(region.getByText('Turn 51')).toBeDefined();
    await userEvent.click(region.getByRole('button', { name: 'Load earlier turns (50 before these)' }));
    expect(region.getByText('Loading earlier turns…')).toBeDefined();
    expect(region.queryByRole('button')).toBeNull();
    await act(async () => held.resolve({ kind: 'read', value: turnPage({ turns: turnsAt(1, 50) }) }));
    expect(turnEntries()).toHaveLength(150);
    expect(turnEntries()[0]!.textContent).toContain('Turn 1');
    expect(region.queryByRole('button')).toBeNull();
    expect(gateway.listAgentSessionTurns).toHaveBeenLastCalledWith(PROJECT.projectId, 'session-1', 0);
  });

  it.each([
    [{ kind: 'unavailable' }, 'did not answer with the earlier turns'],
    [{ kind: 'denied', requiredRole: 'project-viewer' }, 'no role on this project that lets you read its agent sessions. Reading it needs the role project-viewer.'],
    [{ kind: 'denied' }, 'no role on this project that lets you read its agent sessions.'],
    [{ kind: 'not-found' }, 'knows no such agent session'],
  ] as const)('shows why the earlier turns could not be loaded after %o, with a retry, and keeps the shown turns', async (failure, text) => {
    const gateway = windowed();
    gateway.listAgentSessionTurns.mockResolvedValueOnce(failure);
    openSession(gateway);
    const region = await shownSession();
    await userEvent.click(region.getByRole('button', { name: 'Load earlier turns (50 before these)' }));
    const alert = await region.findByRole('alert');
    expect(alert.textContent).toContain('Earlier turns cannot be loaded');
    expect(alert.textContent).toContain(text);
    expect(turnEntries()).toHaveLength(100);
    gateway.listAgentSessionTurns.mockResolvedValueOnce({ kind: 'read', value: turnPage({ turns: turnsAt(1, 50) }) });
    await userEvent.click(region.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(turnEntries()).toHaveLength(150));
    expect(region.queryByRole('alert')).toBeNull();
  });
});

describe('the session activity', () => {
  function detailWith(activity: TaskDetail['tasks'][number]['session'], taskId = 'task-1'): TaskDetail {
    return taskDetail({ tasks: [task({ taskId: 'task-0', session: { state: 'stopped' } }), task({ taskId, session: activity })] });
  }

  it('shows the activity of the session’s task from the task detail, spinning while it works', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readTaskDetail.mockResolvedValue({ kind: 'read', value: detailWith({ state: 'working' }) });
    openSession(gateway);
    await shownSession();
    await waitFor(() => expect(indicator().textContent).toBe('Session working'));
    expect(indicator().dataset.indicator).toBe('spins');
    expect(gateway.readTaskDetail).toHaveBeenCalledWith(PROJECT.projectId, 'run-1');
  });

  it('shows an unreachable worker with its last contact, still, and an uncertain process in the danger color', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readTaskDetail.mockResolvedValue({ kind: 'read', value: detailWith({ state: 'worker-unreachable', lastContactAt: '2026-11-03T08:30:00.000Z' }) });
    openSession(gateway);
    await shownSession();
    await waitFor(() => expect(indicator().textContent).toContain('Worker unreachable, last contact'));
    expect(indicator().querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T08:30:00.000Z');
    expect(indicator().dataset).toMatchObject({ indicator: 'still', tone: 'still' });
    gateway.readTaskDetail.mockResolvedValue({ kind: 'read', value: detailWith({ state: 'process-uncertain' }) });
    act(() => gateway.lastStream().emit({ kind: 'card-changed', ...at('41'), card: card() }));
    await waitFor(() => expect(indicator().textContent).toBe('Process state uncertain'));
    expect(indicator().dataset).toMatchObject({ indicator: 'still', tone: 'danger' });
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('reads the task detail again on a card change of its run, not of another run, and on a new snapshot', async () => {
    const gateway = new FakeBoardGateway();
    openSession(gateway);
    await shownSession();
    await waitFor(() => expect(indicator().textContent).toBe('Session working'));
    act(() => gateway.lastStream().emit({ kind: 'card-changed', ...at('41'), card: card({ runId: 'run-2' }) }));
    await act(async () => {});
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
    act(() => gateway.lastStream().emit({ kind: 'card-changed', ...at('42'), card: card() }));
    await waitFor(() => expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2));
    act(() => gateway.lastStream().emit({ kind: 'resync' }));
    await waitFor(() => expect(gateway.readAgentSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(gateway.readTaskDetail).toHaveBeenCalledTimes(3));
  });

  it('says that the activity loads, and why it could not be read, with a retry', async () => {
    const gateway = new FakeBoardGateway();
    const held = deferred<ReadResult<TaskDetail>>();
    gateway.readTaskDetail.mockReturnValueOnce(held.promise);
    openSession(gateway);
    await shownSession();
    expect(screen.getByText('Loading the session activity…')).toBeDefined();
    await act(async () => held.resolve({ kind: 'denied', requiredRole: 'project-viewer' }));
    expect(await alertNamed('The session activity cannot be loaded')).toContain('Reading it needs the role project-viewer.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(indicator().textContent).toBe('Session working'));
  });

  it('says when the task detail lists no task of the session', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readTaskDetail.mockResolvedValue({ kind: 'read', value: detailWith({ state: 'working' }, 'task-9') });
    openSession(gateway);
    await shownSession();
    expect(await screen.findByText('The task detail of run run-1 lists no task task-1, so no activity is shown.')).toBeDefined();
    expect(screen.getByRole('main').querySelector('[data-indicator]')).toBeNull();
  });

  it('spins nowhere under reduced motion, and keeps the labels', async () => {
    await withReducedMotion(async () => {
      const gateway = new FakeBoardGateway();
      const held = deferred<ReadResult<TaskDetail>>();
      gateway.readTaskDetail.mockReturnValueOnce(held.promise);
      openSession(gateway);
      await shownSession();
      const loading = screen.getByText('Loading the session activity…').parentElement!;
      expect(loading.querySelector('.mantine-Loader-root')).toBeNull();
      await act(async () => held.resolve({ kind: 'read', value: detailWith({ state: 'working' }) }));
      await waitFor(() => expect(indicator().textContent).toBe('Session working'));
      expect(indicator().dataset.indicator).toBe('still');
      expect(screen.getByRole('main').querySelector('.mantine-Loader-root')).toBeNull();
    });
  });
});

describe('the session page states', () => {
  it('shows the time of its last known state while the live updates are lost', async () => {
    const gateway = new FakeBoardGateway();
    openSession(gateway);
    await shownSession();
    const stream = gateway.lastStream();
    act(() => stream.emit({ kind: 'opened' }));
    expect(screen.queryByText('Live updates lost')).toBeNull();
    act(() => stream.emit({ kind: 'interrupted' }));
    const status = screen.getByText('Live updates lost').closest('[role="status"]') as HTMLElement;
    expect(status.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T09:00:00.000Z');
    act(() => stream.emit({ kind: 'opened' }));
    expect(screen.queryByText('Live updates lost')).toBeNull();
  });

  it.each([
    [{ kind: 'not-found' }, 'Agent session not found', 'knows no such agent session'],
    [{ kind: 'denied', requiredRole: 'project-viewer' }, 'No access to this agent session', 'Reading it needs the role project-viewer.'],
    [{ kind: 'unavailable' }, 'The agent session cannot be loaded', 'no session data is shown'],
  ] as const)('shows the failure %o with a retry and no session data', async (failure, title, text) => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce(failure);
    openSession(gateway);
    expect(await alertNamed(title)).toContain(text);
    expect(screen.queryByRole('region', { name: 'Turns' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await shownSession();
    expect(gateway.readAgentSession).toHaveBeenCalledTimes(2);
  });

  it('shows the sign-in page with the expired notice on an unauthenticated answer', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValue({ kind: 'unauthenticated' });
    renderApp(SESSION_PATH, session, new ManualClock(), gateway);
    expect(await screen.findByText('Your session expired')).toBeDefined();
    await waitFor(() => expect(session.read).toHaveBeenCalledTimes(2));
  });

  it('shows the session of a new address and never a state of the earlier one', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockImplementation(async (_project, sessionId) => ({
      kind: 'read',
      value: agentSessionView({ session: agentSession({ sessionId, taskId: `task-of-${sessionId}` }) }),
    }));
    const view = openSession(gateway);
    await shownSession();
    await act(() => view.router.navigate('/sessions/project-1/session-2'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent session session-2' })).toBeDefined();
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('task task-of-session-2'));
    expect(gateway.openStreams()).toHaveLength(1);
  });
});
