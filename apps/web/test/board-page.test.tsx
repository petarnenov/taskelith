import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Board, BoardCard, Project, ReadResult } from '../src/board/board';
import type { SessionRead } from '../src/session/session';
import { formatInstant } from '../src/board/board-labels';
import { PROJECT_KEY } from '../src/board/ProjectsProvider';
import { ANONYMOUS, AUTHENTICATED, board, card, FakeBoardGateway, fakeGateway, ManualClock, OTHER_PROJECT, PROJECT, renderApp } from './fakes';

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function boardGatewayWith(snapshot: Board, projects: readonly Project[] = [PROJECT]) {
  const gateway = new FakeBoardGateway();
  gateway.listProjects.mockResolvedValue({ kind: 'read', value: projects });
  gateway.readBoard.mockResolvedValue({ kind: 'read', value: snapshot });
  return gateway;
}

function showBoard(snapshot: Board = board(), projects?: readonly Project[]) {
  const boardGateway = boardGatewayWith(snapshot, projects);
  return renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
}

async function columns() {
  await screen.findByRole('heading', { level: 2, name: 'Propose' });
  return within(screen.getByRole('main'))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
}

function column(name: string) {
  return within(screen.getByRole('region', { name }));
}

async function cardNamed(title: string) {
  return within(await screen.findByRole('article', { name: title }));
}

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

function spinnerOf(status: string) {
  return screen.getByText(status).closest('[role="status"]')?.querySelector('.mantine-Loader-root') ?? null;
}

function indicatorOf(title: string) {
  const article = screen.getByRole('article', { name: title });
  const indicator = article.querySelector('[data-indicator]');
  if (indicator === null) throw new Error(`No indicator on ${title}`);
  return indicator as HTMLElement;
}

describe('the board columns', () => {
  it('shows the six columns under short labels with the merge gate between Review and Archived', async () => {
    showBoard();
    expect(await columns()).toEqual(['Propose', 'Specify', 'Implement', 'Verify', 'Review', 'Accept and integrate', 'Archived']);
    expect(column('Propose').getByText('Propose and inspect')).toBeDefined();
    expect(column('Archived').getByText('Close')).toBeDefined();
    expect(column('Accept and integrate').getByText('Merge gate between Review and Archived')).toBeDefined();
    expect(column('Review').getByLabelText('0 cards')).toBeDefined();
  });

  it('lets the keyboard reach and scroll the columns through a named, focusable viewport', async () => {
    showBoard();
    await columns();
    const viewport = screen.getByRole('region', { name: 'Board columns' });
    expect(viewport.tabIndex).toBe(0);
    expect(within(viewport).getByRole('region', { name: 'Archived' })).toBeDefined();
    viewport.focus();
    expect(document.activeElement).toBe(viewport);
  });

  it('says that the board is empty while no card exists', async () => {
    showBoard();
    expect(await screen.findByText(/No card yet\./)).toBeDefined();
    expect(screen.queryAllByRole('article')).toEqual([]);
  });

  it('puts each card in its column and names the project', async () => {
    const cards = [card({ runId: 'a', title: 'Draft', column: 'propose' }), card({ runId: 'b', title: 'Done', column: 'archived' })];
    showBoard(board({ cards }));
    await cardNamed('Draft');
    expect(column('Propose').getByRole('article', { name: 'Draft' })).toBeDefined();
    expect(column('Archived').getByRole('article', { name: 'Done' })).toBeDefined();
    expect(column('Propose').getByLabelText('1 cards')).toBeDefined();
    expect(screen.queryByText(/No card yet\./)).toBeNull();
    expect(screen.getByRole('main').textContent).toContain('Project Taskelith');
  });
});

describe('a card', () => {
  it('names its native step, stage state, work type, and framework', async () => {
    showBoard(board({ cards: [card()] }));
    const shown = await cardNamed('Add the board');
    expect(shown.getByText('Step: apply · in progress')).toBeDefined();
    expect(shown.getByText('Feature · openspec 1.3.0')).toBeDefined();
  });

  it('shows "platform-managed" where the framework mapping records a gap', async () => {
    const managed = card({ column: 'verify', stage: { stageId: 'verify', origin: 'platform-managed', state: 'not-started' } });
    showBoard(board({ cards: [managed] }));
    expect((await cardNamed('Add the board')).getByText('Step: platform-managed · not started')).toBeDefined();
  });

  it('shows its gate, wait, placement obstacle, and task end', async () => {
    const observedAt = '2026-11-03T08:30:00.000Z';
    const waiting = card({
      gate: 'stale',
      waitingFor: 'capacity',
      obstacle: { taskId: 't', observedAt, source: 'automatic-retry', disposition: 'waiting', reason: 'retry-backoff', retryNumber: 2 },
      end: {
        kind: 'retries-exhausted',
        taskId: 't',
        attemptId: 'a',
        outcome: { kind: 'not-started', ownershipGeneration: 1, cancelled: false, endedAt: observedAt },
      },
    });
    showBoard(board({ cards: [waiting] }));
    const shown = await cardNamed('Add the board');
    expect(shown.getByText('Gate stale')).toBeDefined();
    expect(shown.getByText('Waits for capacity')).toBeDefined();
    const obstacle = shown.getByText(/^Not placed: retry backoff, retry 2 \(automatic-retry,/);
    expect(obstacle.querySelector('time')?.getAttribute('dateTime')).toBe(observedAt);
    expect(obstacle.textContent).toContain(formatInstant(observedAt));
    expect(shown.getByText('Ended without a merge: retries exhausted')).toBeDefined();
  });

  it('says that a rejected task was rejected, and counts its open inbox items', async () => {
    const rejected = card({
      needsYou: 2,
      obstacle: { taskId: 't', observedAt: '2026-11-03T08:30:00.000Z', source: 'scheduler', disposition: 'rejected', reason: 'retry-budget-exhausted' },
    });
    showBoard(board({ cards: [rejected, card({ runId: 'one', title: 'One item', needsYou: 1 })] }));
    const shown = await cardNamed('Add the board');
    expect(shown.getByText(/^Rejected: retry budget exhausted \(scheduler,/)).toBeDefined();
    expect(shown.getByText('2 open items in “Needs you”')).toBeDefined();
    expect((await cardNamed('One item')).getByText('1 open item in “Needs you”')).toBeDefined();
  });

  it('shows the merge gate state of a card at the gate, on the card and at the gate', async () => {
    const queued = card({ runId: 'q', title: 'Queued change', column: 'review', integration: 'queued' });
    const notReady = card({ runId: 'n', title: 'Still in review', column: 'review' });
    showBoard(board({ cards: [queued, notReady] }));
    expect((await cardNamed('Queued change')).getByText('Merge gate: queued')).toBeDefined();
    expect((await cardNamed('Still in review')).queryByText(/Merge gate:/)).toBeNull();
    const gate = column('Accept and integrate');
    expect(gate.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Queued change: queued']);
  });

  it('says that no card is at the gate when none is', async () => {
    showBoard(board({ cards: [card({ column: 'review' })] }));
    await cardNamed('Add the board');
    expect(column('Accept and integrate').getByText('No card at the gate.')).toBeDefined();
  });
});

describe('the session activity indicator', () => {
  const cards: BoardCard[] = [
    card({ runId: '1', title: 'Working', session: { state: 'working' } }),
    card({ runId: '2', title: 'Waiting', session: { state: 'waiting-for-person' } }),
    card({ runId: '3', title: 'Admission', session: { state: 'waiting-for-admission' } }),
    card({ runId: '4', title: 'Stopped', session: { state: 'stopped' } }),
    card({ runId: '5', title: 'None', session: { state: 'none' } }),
    card({ runId: '6', title: 'Unreachable', session: { state: 'worker-unreachable', lastContactAt: '2026-11-03T08:00:00.000Z' } }),
    card({ runId: '7', title: 'Uncertain', session: { state: 'process-uncertain' } }),
  ];

  it('spins while the harness works and stays still with a label for every other state', async () => {
    showBoard(board({ cards }));
    await cardNamed('Working');
    const look = (title: string) => {
      const indicator = indicatorOf(title);
      return [indicator.dataset.indicator, indicator.dataset.tone, indicator.textContent];
    };
    expect(look('Working')).toEqual(['spins', 'spins', 'Session working']);
    expect(indicatorOf('Working').querySelector('.mantine-Loader-root')).not.toBeNull();
    expect(look('Waiting')).toEqual(['still', 'still', 'Waiting for a person']);
    expect(look('Admission')).toEqual(['still', 'still', 'Waiting for its next stage admission']);
    expect(look('Stopped')).toEqual(['still', 'muted', 'Session stopped']);
    expect(look('None')).toEqual(['still', 'muted', 'No session']);
    expect(look('Uncertain')).toEqual(['still', 'danger', 'Process state uncertain']);
    const unreachable = indicatorOf('Unreachable');
    expect(unreachable.textContent).toBe(`Worker unreachable, last contact ${formatInstant('2026-11-03T08:00:00.000Z')}`);
    expect(unreachable.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T08:00:00.000Z');
  });

  it('draws a still indicator in the danger color only for an uncertain process, and gray when muted', async () => {
    showBoard(board({ cards }));
    await cardNamed('Uncertain');
    const swatch = (title: string) => indicatorOf(title).querySelector('.mantine-ColorSwatch-colorOverlay') as HTMLElement;
    expect(swatch('Uncertain').style.backgroundColor).toBe('var(--mantine-color-red-filled)');
    expect(swatch('Stopped').style.backgroundColor).toBe('var(--mantine-color-gray-filled)');
    expect(swatch('Waiting').style.backgroundColor).toBe('var(--mantine-color-indigo-filled)');
  });

  it('spins nowhere when the system asks for reduced motion, and keeps the labels', async () => {
    await withReducedMotion(async () => {
      showBoard(board({ cards }));
      await cardNamed('Working');
      await waitFor(() => expect(indicatorOf('Working').dataset.indicator).toBe('still'));
      expect(indicatorOf('Working').textContent).toBe('Session working');
      expect(screen.getByRole('main').querySelector('[data-indicator] .mantine-Loader-root')).toBeNull();
    });
  });
});

describe('the board states', () => {
  it('guides into project setup on the first run, without a link to an unbuilt screen', async () => {
    const boardGateway = new FakeBoardGateway();
    boardGateway.listProjects.mockResolvedValue({ kind: 'read', value: [] });
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No project yet')).toBeDefined();
    expect(alert.textContent).toContain('createProject operation (POST /projects)');
    expect(alert.textContent).toContain('The project setup screen is not built yet');
    expect(within(alert).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(boardGateway.readBoard).not.toHaveBeenCalled();
  });

  it('shows that it loads, and no column, until the board answers', async () => {
    const boardGateway = new FakeBoardGateway();
    const projects = deferred<ReadResult<readonly Project[]>>();
    const snapshot = deferred<ReadResult<Board>>();
    boardGateway.listProjects.mockReturnValueOnce(projects.promise);
    boardGateway.readBoard.mockReturnValueOnce(snapshot.promise);
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    expect(await screen.findByText('Loading your projects…')).toBeDefined();
    await act(async () => projects.resolve({ kind: 'read', value: [PROJECT] }));
    expect(await screen.findByText('Loading the board…')).toBeDefined();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    await act(async () => snapshot.resolve({ kind: 'read', value: board() }));
    expect(await columns()).toHaveLength(7);
  });

  it('keeps the loading texts but spins no loader when the system asks for reduced motion', async () => {
    await withReducedMotion(async () => {
      const boardGateway = new FakeBoardGateway();
      const projects = deferred<ReadResult<readonly Project[]>>();
      boardGateway.listProjects.mockReturnValueOnce(projects.promise);
      boardGateway.readBoard.mockReturnValueOnce(deferred<ReadResult<Board>>().promise);
      renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
      expect(await screen.findByText('Loading your projects…')).toBeDefined();
      await waitFor(() => expect(spinnerOf('Loading your projects…')).toBeNull());
      await act(async () => projects.resolve({ kind: 'read', value: [PROJECT] }));
      expect(await screen.findByText('Loading the board…')).toBeDefined();
      await waitFor(() => expect(spinnerOf('Loading the board…')).toBeNull());
    });
  });

  it('shows no task data when the board cannot be loaded, and loads it on retry', async () => {
    const boardGateway = boardGatewayWith(board({ cards: [card()] }));
    boardGateway.readBoard.mockResolvedValueOnce({ kind: 'unavailable' });
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The board cannot be loaded')).toBeDefined();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await cardNamed('Add the board')).toBeDefined();
    expect(boardGateway.readBoard).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['denied', 'No access to this board'],
    ['not-found', 'Project not found'],
  ] as const)('says why for a %s answer', async (kind, title) => {
    const boardGateway = boardGatewayWith(board());
    boardGateway.readBoard.mockResolvedValueOnce({ kind });
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    expect(within(await screen.findByRole('alert')).getByText(title)).toBeDefined();
  });

  it('names the role a 403 answer says the board needs', async () => {
    const boardGateway = boardGatewayWith(board());
    boardGateway.readBoard.mockResolvedValueOnce({ kind: 'denied', requiredRole: 'project-viewer' });
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Reading it needs the role project-viewer.');
  });

  it('offers a retry when the projects cannot be read', async () => {
    const boardGateway = boardGatewayWith(board());
    boardGateway.listProjects.mockResolvedValueOnce({ kind: 'unavailable' });
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    expect(within(await screen.findByRole('alert')).getByText('The projects cannot be read')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await columns()).toHaveLength(7);
  });

  it('says when no worker is online and when the caller may only read', async () => {
    showBoard(board({ workersOnline: 0, callerMayAct: false }));
    await columns();
    expect(screen.getByText('No workers online')).toBeDefined();
    expect(screen.getByText('Read-only')).toBeDefined();
  });

  it('says nothing of workers or roles when workers are online and the caller may act', async () => {
    showBoard();
    await columns();
    expect(screen.queryByText('No workers online')).toBeNull();
    expect(screen.queryByText('Read-only')).toBeNull();
    expect(screen.queryByText('Live updates lost')).toBeNull();
  });
});

describe('live updates', () => {
  it('moves a card and counts workers as its events arrive', async () => {
    const { boardGateway } = showBoard(board({ cards: [card()] }));
    await cardNamed('Add the board');
    const stream = (boardGateway as FakeBoardGateway).lastStream();
    expect(stream.after).toBe('40');
    act(() => {
      stream.emit({ kind: 'opened' });
      stream.emit({ kind: 'card-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z', card: card({ column: 'verify' }) });
      stream.emit({ kind: 'board-changed', position: '42', occurredAt: '2026-11-03T09:02:00.000Z', workersOnline: 0 });
    });
    expect(column('Verify').getByRole('article', { name: 'Add the board' })).toBeDefined();
    expect(column('Implement').queryByRole('article')).toBeNull();
    expect(screen.getByText('No workers online')).toBeDefined();
  });

  it('shows the time of the last known state while the live updates are lost', async () => {
    const { boardGateway } = showBoard(board({ cards: [card()] }));
    await cardNamed('Add the board');
    const stream = (boardGateway as FakeBoardGateway).lastStream();
    act(() => {
      stream.emit({ kind: 'card-changed', position: '41', occurredAt: '2026-11-03T09:05:00.000Z', card: card() });
      stream.emit({ kind: 'interrupted' });
    });
    const status = screen.getByText('Live updates lost').closest('[role="status"]') as HTMLElement;
    expect(status.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T09:05:00.000Z');
    expect(status.textContent).toContain(formatInstant('2026-11-03T09:05:00.000Z'));
    expect(screen.getByRole('article', { name: 'Add the board' })).toBeDefined();
    act(() => stream.emit({ kind: 'opened' }));
    expect(screen.queryByText('Live updates lost')).toBeNull();
  });

  it('closes the stream when the operator leaves the board', async () => {
    const { boardGateway } = showBoard();
    await columns();
    await userEvent.click(screen.getAllByRole('link', { name: 'Sessions' })[0]!);
    await screen.findByRole('heading', { level: 1, name: 'Agent sessions' });
    expect((boardGateway as FakeBoardGateway).openStreams()).toEqual([]);
  });
});

describe('the project picker', () => {
  it('names the chosen project and switches the board to another one, which the browser keeps', async () => {
    const { boardGateway, unmount } = showBoard(board(), [PROJECT, OTHER_PROJECT]);
    await columns();
    const user = userEvent.setup();
    const pickers = screen.getAllByRole('button', { name: 'Project: Taskelith' });
    expect(pickers.length).toBeGreaterThan(0);
    await user.click(pickers[0]!);
    await user.click(await screen.findByRole('menuitem', { name: 'Website' }));
    await waitFor(() => expect(boardGateway.readBoard).toHaveBeenLastCalledWith(OTHER_PROJECT.projectId));
    expect(screen.getAllByRole('button', { name: 'Project: Website' }).length).toBeGreaterThan(0);
    expect(localStorage.getItem(PROJECT_KEY)).toBe(OTHER_PROJECT.projectId);
    unmount();
    const again = boardGatewayWith(board(), [PROJECT, OTHER_PROJECT]);
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), again);
    await waitFor(() => expect(again.readBoard).toHaveBeenCalledWith(OTHER_PROJECT.projectId));
  });

  it('falls back to the first project when the kept one is no longer listed', async () => {
    localStorage.setItem(PROJECT_KEY, 'gone');
    const { boardGateway } = showBoard(board(), [PROJECT, OTHER_PROJECT]);
    await columns();
    expect(boardGateway.readBoard).toHaveBeenCalledWith(PROJECT.projectId);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the first run, without an error, when the kept project is gone and none is listed', async () => {
    localStorage.setItem(PROJECT_KEY, 'gone');
    const boardGateway = boardGatewayWith(board(), []);
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No project yet')).toBeDefined();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(boardGateway.readBoard).not.toHaveBeenCalled();
  });

  it('marks the chosen project in its menu', async () => {
    showBoard(board(), [PROJECT, OTHER_PROJECT]);
    await columns();
    await userEvent.click(screen.getAllByRole('button', { name: 'Project: Taskelith' })[0]!);
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => [item.textContent, item.getAttribute('aria-current')])).toEqual([
      ['Taskelith', 'true'],
      ['Website', null],
    ]);
  });

  it('works when the browser blocks its storage', async () => {
    const storage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: blocked });
    try {
      const { boardGateway } = showBoard(board(), [PROJECT, OTHER_PROJECT]);
      await columns();
      await userEvent.click(screen.getAllByRole('button', { name: 'Project: Taskelith' })[0]!);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Website' }));
      await waitFor(() => expect(boardGateway.readBoard).toHaveBeenLastCalledWith(OTHER_PROJECT.projectId));
    } finally {
      Object.defineProperty(window, 'localStorage', storage);
    }
  });
});

describe('an unauthenticated answer', () => {
  it('of readBoard shows the sign-in page with the expired notice and reads a fresh session', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const boardGateway = boardGatewayWith(board());
    boardGateway.readBoard.mockResolvedValueOnce({ kind: 'unauthenticated' });
    renderApp('/app/', session, new ManualClock(), boardGateway);
    expect(await screen.findByText('Your session expired')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
    await waitFor(() => expect(session.read).toHaveBeenCalledTimes(2));
  });

  it('of listProjects does the same', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const boardGateway = boardGatewayWith(board());
    boardGateway.listProjects.mockResolvedValueOnce({ kind: 'unauthenticated' });
    renderApp('/app/', session, new ManualClock(), boardGateway);
    expect(await screen.findByText('Your session expired')).toBeDefined();
  });

  it('takes over a session that another tab logged in meanwhile, and reads the board again', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const renewal = deferred<SessionRead>();
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockReturnValueOnce(renewal.promise);
    const boardGateway = boardGatewayWith(board());
    boardGateway.readBoard.mockResolvedValueOnce({ kind: 'unauthenticated' });
    renderApp('/app/', session, new ManualClock(), boardGateway);
    expect(await screen.findByText('Your session expired')).toBeDefined();
    await act(async () => renewal.resolve(AUTHENTICATED));
    expect(await columns()).toHaveLength(7);
    expect(boardGateway.readBoard).toHaveBeenCalledTimes(2);
  });

  it('of a request sent before a logout leaves the session of a later login signed in', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const renewal = deferred<SessionRead>();
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(ANONYMOUS).mockReturnValueOnce(renewal.promise);
    const late = deferred<ReadResult<Board>>();
    const boardGateway = boardGatewayWith(board());
    boardGateway.readBoard.mockReturnValueOnce(late.promise);
    renderApp('/app/', session, new ManualClock(), boardGateway);
    expect(await screen.findByText('Loading the board…')).toBeDefined();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('You signed out')).toBeDefined();
    await user.type(await screen.findByLabelText(/Login name/), 'operator');
    await user.type(screen.getByLabelText(/Password/), 'fixture-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await columns()).toHaveLength(7);
    await act(async () => late.resolve({ kind: 'unauthenticated' }));
    expect(screen.queryByText('Your session expired')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Project board' })).toBeDefined();
    expect(session.read).toHaveBeenCalledTimes(2);
  });

  it('reads a gateway that throws as an unreachable control plane', async () => {
    const boardGateway = boardGatewayWith(board());
    boardGateway.readBoard.mockRejectedValueOnce(new Error('broken'));
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), boardGateway);
    expect(within(await screen.findByRole('alert')).getByText('The board cannot be loaded')).toBeDefined();
  });
});
