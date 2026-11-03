import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Board, Project, TaskDetail } from '../src/board/board';
import { formatInstant } from '../src/board/board-labels';
import { PROJECT_KEY } from '../src/board/ProjectsProvider';
import {
  AUTHENTICATED,
  board,
  card,
  DIGEST,
  FakeBoardGateway,
  fakeGateway,
  ManualClock,
  OTHER_PROJECT,
  PROJECT,
  renderApp,
  task,
  taskDetail,
} from './fakes';

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const DETAIL_PATH = '/app/projects/project-1/cards/run-1';

function gatewayWith(detail: TaskDetail = taskDetail(), snapshot: Board = board({ cards: [card()] })) {
  const gateway = new FakeBoardGateway();
  gateway.listProjects.mockResolvedValue({ kind: 'read', value: [PROJECT, OTHER_PROJECT] satisfies Project[] });
  gateway.readBoard.mockResolvedValue({ kind: 'read', value: snapshot });
  gateway.readTaskDetail.mockResolvedValue({ kind: 'read', value: detail });
  return gateway;
}

function openDetail(detail?: TaskDetail, path = DETAIL_PATH, gateway = gatewayWith(detail)) {
  return renderApp(path, fakeGateway(AUTHENTICATED), new ManualClock(), gateway);
}

async function drawer() {
  return within(await screen.findByRole('dialog', { name: 'Add the board' }));
}

function section(name: string) {
  return within(screen.getByRole('region', { name }));
}

describe('the task detail route', () => {
  it('links each card to its detail, which opens over the board without reading the board again', async () => {
    const view = renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), gatewayWith());
    const link = await screen.findByRole('link', { name: 'Add the board' });
    expect(link.getAttribute('href')).toBe(DETAIL_PATH);
    await userEvent.click(link);
    await drawer();
    expect(view.router.state.location.pathname).toBe(DETAIL_PATH);
    expect(view.boardGateway.readTaskDetail).toHaveBeenCalledWith(PROJECT.projectId, 'run-1');
    expect(view.boardGateway.readBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('article', { name: 'Add the board' })).toBeDefined();
  });

  it('encodes the project and the run in the link of a card', async () => {
    const gateway = gatewayWith(taskDetail(), board({ cards: [card({ runId: 'run/1 a' })] }));
    renderApp('/app/', fakeGateway(AUTHENTICATED), new ManualClock(), gateway);
    const link = await screen.findByRole('link', { name: 'Add the board' });
    expect(link.getAttribute('href')).toBe('/app/projects/project-1/cards/run%2F1%20a');
  });

  it('keeps the detail on a reload of its address, and closing it leads back to the board', async () => {
    const view = openDetail();
    const detail = await drawer();
    await userEvent.click(detail.getByRole('button', { name: 'Close the task detail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(view.router.state.location.pathname).toBe('/app');
    expect(screen.getByRole('article', { name: 'Add the board' })).toBeDefined();
  });

  it('titles the dialog with one heading of level 2 and no heading inside it', async () => {
    openDetail();
    const detail = await drawer();
    const title = detail.getByRole('heading', { level: 2 });
    expect(title.textContent).toBe('Add the board');
    expect(title.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
  });

  it('shows that it loads until the detail answers', async () => {
    const gateway = gatewayWith();
    gateway.readTaskDetail.mockReturnValue(new Promise(() => {}));
    openDetail(undefined, DETAIL_PATH, gateway);
    const loading = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(loading).getByText('Loading the task detail…')).toBeDefined();
  });
});

describe('the project of a task detail address', () => {
  it('becomes the chosen project, and no other board is read before it', async () => {
    localStorage.setItem(PROJECT_KEY, PROJECT.projectId);
    const gateway = gatewayWith(taskDetail({ card: card({ runId: 'run-9' }) }));
    openDetail(undefined, '/app/projects/project-2/cards/run-9', gateway);
    await drawer();
    expect((await screen.findAllByRole('button', { name: 'Project: Website' })).length).toBeGreaterThan(0);
    expect(gateway.readBoard.mock.calls).toEqual([[OTHER_PROJECT.projectId]]);
    expect(gateway.readTaskDetail).toHaveBeenCalledWith(OTHER_PROJECT.projectId, 'run-9');
    expect(localStorage.getItem(PROJECT_KEY)).toBe(OTHER_PROJECT.projectId);
  });

  it('closes the detail when the operator chooses another project', async () => {
    const view = openDetail();
    await drawer();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Project: Taskelith', hidden: true })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: 'Website', hidden: true }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/app'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(view.boardGateway.readBoard).toHaveBeenLastCalledWith(OTHER_PROJECT.projectId));
  });

  it('keeps the detail open when the operator chooses the same project', async () => {
    const view = openDetail();
    await drawer();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Project: Taskelith', hidden: true })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: 'Taskelith', hidden: true }));
    expect(view.router.state.location.pathname).toBe(DETAIL_PATH);
  });
});

describe('the task detail', () => {
  it('names the card, its step, column, and session', async () => {
    openDetail();
    const detail = await drawer();
    expect(detail.getByText('Feature · openspec 1.3.0 · run run-1')).toBeDefined();
    expect(detail.getByText('Implement · Step: apply · in progress')).toBeDefined();
    expect(detail.getAllByText('Session working').length).toBeGreaterThan(0);
  });

  it('shows each stage in graph order with its gates, their states, and the evidence they need', async () => {
    const stages = [
      ...taskDetail().stages,
      {
        stageId: 'verify-gap',
        origin: 'platform-managed' as const,
        state: 'not-started' as const,
        column: 'verify' as const,
        gates: [
          { gateId: 'tests', state: 'stale' as const, requiredEvidence: 'platform-record' as const },
          { gateId: 'approval', state: 'pending' as const, requiredEvidence: 'semantic-approval' as const },
        ],
      },
    ];
    openDetail(taskDetail({ stages }));
    await drawer();
    const rows = section('Stages and gates').getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      'propose',
      'apply',
      'platform-managed',
    ]);
    expect(within(rows[0]!).getByText('proposal-valid passed')).toBeDefined();
    expect(within(rows[0]!).getByText('needs structural validation')).toBeDefined();
    expect(within(rows[1]!).getByText('No gate')).toBeDefined();
    expect(within(rows[2]!).getByText('tests stale')).toBeDefined();
    expect(within(rows[2]!).getByText('approval pending')).toBeDefined();
    expect(within(rows[2]!).getByText('Verify')).toBeDefined();
  });

  it('says why the card does not move: its wait, obstacle, blocked gates, and task end', async () => {
    const obstacle = {
      taskId: 'task-1',
      observedAt: '2026-11-03T08:30:00.000Z',
      source: 'scheduler',
      disposition: 'waiting',
      reason: 'worker-not-eligible',
    } as const;
    const blocked = {
      stageId: 'review',
      origin: 'native' as const,
      state: 'in-progress' as const,
      column: 'review' as const,
      gates: [{ gateId: 'merge', state: 'blocked' as const, requiredEvidence: 'platform-record' as const, blockReason: 'Conflict' }],
    };
    const end = {
      kind: 'cancelled',
      taskId: 'task-1',
      attemptId: 'attempt-1',
      outcome: { kind: 'not-started', ownershipGeneration: 1, cancelled: true, endedAt: '2026-11-03T08:00:00.000Z' },
    } as const;
    openDetail(taskDetail({ card: card({ waitingFor: 'reviewer', obstacle, end }), stages: [blocked] }));
    await drawer();
    const reasons = section('Why it does not move');
    expect(reasons.getByText('Waits for a reviewer')).toBeDefined();
    expect(reasons.getByText(/Not placed: worker not eligible/)).toBeDefined();
    expect(reasons.getByText('Gate merge of review is blocked: Conflict')).toBeDefined();
    expect(reasons.getByText('Ended without a merge: cancelled')).toBeDefined();
  });

  it('says nothing of a reason when nothing holds the card', async () => {
    openDetail();
    await drawer();
    expect(screen.queryByRole('region', { name: 'Why it does not move' })).toBeNull();
  });

  it('says honestly that no traceability is recorded yet', async () => {
    openDetail();
    await drawer();
    expect(section('Traceability').getByText('The control plane records no requirement traceability for this run yet.')).toBeDefined();
  });

  it('shows each requirement with its work items, attempts, and evidence freshness', async () => {
    const traceability = [
      { requirement: 'Board columns', workItemIds: ['1.1', '1.2'], attemptIds: ['attempt-1'], evidence: 'stale' as const },
      { requirement: 'Picker', workItemIds: [], attemptIds: [], evidence: 'missing' as const },
    ];
    openDetail(taskDetail({ traceability }));
    await drawer();
    const rows = section('Traceability').getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(['Board columns1.1, 1.2attempt-1stale', 'Pickernonenonemissing']);
  });

  it('shows the run binding', async () => {
    openDetail();
    await drawer();
    const binding = section('Run binding');
    expect(binding.getByRole('rowheader', { name: 'Workflow digest' }).closest('tr')?.textContent).toBe(`Workflow digest${DIGEST}`);
    expect(binding.getByRole('rowheader', { name: 'Policy revision' }).closest('tr')?.textContent).toBe('Policy revisionpolicy-3');
    expect(binding.getAllByRole('row')).toHaveLength(8);
  });

  it('lists the tasks in admission order with admission, generation, delegation, session, and end', async () => {
    const tasks = [
      task(),
      task({
        taskId: 'task-2',
        taskRunId: 'child-run-2',
        ownershipGeneration: 1,
        admission: {
          admissionId: 'admission-2',
          stageId: 'apply',
          workItemId: '1.2',
          state: 'admitted',
          policyRevision: 'policy-3',
          dispatchedGeneration: 1,
        },
        delegation: { parentTaskId: 'task-1', depth: 1 },
        session: { state: 'worker-unreachable', lastContactAt: '2026-11-03T08:00:00.000Z' },
        end: {
          kind: 'uncertain-exit',
          taskId: 'task-2',
          attemptId: 'attempt-4',
          outcome: {
            kind: 'exited',
            ownershipGeneration: 1,
            cancelled: false,
            endedAt: '2026-11-03T08:10:00.000Z',
            executionId: 'exec-1',
            status: { kind: 'code', code: 3 },
            startProven: true,
          },
        },
      }),
    ];
    openDetail(taskDetail({ tasks }));
    await drawer();
    const items = section('Tasks in admission order').getAllByRole('listitem');
    expect(items.map((item) => within(item).getAllByText(/^task-/)[0]!.textContent)).toEqual(['task-1', 'task-2']);
    const second = within(items[1]!);
    expect(second.getByText('Run child-run-2, ownership generation 1')).toBeDefined();
    expect(second.getByText('Delegated by task-1, depth 1')).toBeDefined();
    expect(
      second.getByText(
        'Admission admission-2: admitted for stage apply, work item 1.2, policy revision policy-3, dispatched generation 1',
      ),
    ).toBeDefined();
    expect(second.getByText(/Worker unreachable, last contact/)).toBeDefined();
    const end = second.getByText(/Ended without a merge: uncertain exit; attempt attempt-4 exited with code 3/);
    expect(end.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T08:10:00.000Z');
  });

  it.each([
    [{ kind: 'signal', signal: 'SIGKILL' }, 'exited on SIGKILL'],
    [{ kind: 'unknown' }, 'exited with an unknown status'],
  ] as const)('names the exit %o of a task end', async (status, text) => {
    const outcome = { kind: 'exited', ownershipGeneration: 1, cancelled: false, endedAt: '2026-11-03T08:10:00.000Z', executionId: 'e', status, startProven: false } as const;
    openDetail(taskDetail({ tasks: [task({ end: { kind: 'uncertain-exit', taskId: 'task-1', attemptId: 'a', outcome } })] }));
    await drawer();
    expect(section('Tasks in admission order').getByText(new RegExp(text))).toBeDefined();
  });

  it('names an operator resolution with its evidence and an attempt that never started', async () => {
    const resolved = { kind: 'operator-resolved', ownershipGeneration: 1, cancelled: false, endedAt: '2026-11-03T08:10:00.000Z', executionId: 'e', evidence: 'Process gone' } as const;
    const unstarted = { kind: 'not-started', ownershipGeneration: 1, cancelled: true, endedAt: '2026-11-03T08:10:00.000Z' } as const;
    const tasks = [
      task({ end: { kind: 'cancelled', taskId: 'task-1', attemptId: 'a', outcome: resolved } }),
      task({ taskId: 'task-2', end: { kind: 'cancelled', taskId: 'task-2', attemptId: 'b', outcome: unstarted } }),
    ];
    openDetail(taskDetail({ tasks }));
    await drawer();
    const list = section('Tasks in admission order');
    expect(list.getByText(/attempt a resolved by an operator: Process gone/)).toBeDefined();
    expect(list.getByText(/attempt b never started/)).toBeDefined();
  });

  it('says when the run has no stage and no task yet', async () => {
    openDetail(taskDetail({ stages: [], tasks: [] }));
    await drawer();
    expect(section('Stages and gates').getByText('The run has no stage yet.')).toBeDefined();
    expect(section('Tasks in admission order').getByText('No task of this run was admitted yet.')).toBeDefined();
  });
});

describe('a task detail that cannot be read', () => {
  it.each([
    [{ kind: 'not-found' } as const, 'Task not found', 'The control plane knows no such card in this project.'],
    [
      { kind: 'denied', requiredRole: 'project-viewer' } as const,
      'No access to this task',
      'You hold no role on this project that lets you read its tasks. Reading it needs the role project-viewer.',
    ],
  ])('shows why for %o, and no task data', async (failure, title, text) => {
    const gateway = gatewayWith();
    gateway.readTaskDetail.mockResolvedValue(failure);
    openDetail(undefined, DETAIL_PATH, gateway);
    const detail = within(await screen.findByRole('dialog', { name: 'Task detail' }));
    expect(await detail.findByText(title)).toBeDefined();
    expect(detail.getByText(text)).toBeDefined();
    expect(detail.queryByRole('region')).toBeNull();
  });

  it('offers a retry that reads the detail again', async () => {
    const gateway = gatewayWith();
    gateway.readTaskDetail.mockResolvedValueOnce({ kind: 'unavailable' });
    openDetail(undefined, DETAIL_PATH, gateway);
    const failed = within(await screen.findByRole('dialog', { name: 'Task detail' }));
    expect(await failed.findByText('The task detail cannot be loaded')).toBeDefined();
    await userEvent.click(failed.getByRole('button', { name: 'Retry' }));
    await drawer();
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('shows the sign-in page with the expired notice on an unauthenticated answer', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const gateway = gatewayWith();
    gateway.readTaskDetail.mockResolvedValue({ kind: 'unauthenticated' });
    renderApp(DETAIL_PATH, session, new ManualClock(), gateway);
    expect(await screen.findByText('Your session expired')).toBeDefined();
    await waitFor(() => expect(session.read).toHaveBeenCalledTimes(2));
  });
});

describe('live updates of the task detail', () => {
  it('reads the detail again when the board sees its card change, and not for another card', async () => {
    const gateway = gatewayWith();
    openDetail(undefined, DETAIL_PATH, gateway);
    await drawer();
    // The detail first sees the card on the shown board, before any event.
    await screen.findByRole('article', { name: 'Add the board' });
    const stream = gateway.lastStream();
    gateway.readTaskDetail.mockResolvedValue({
      kind: 'read',
      value: taskDetail({ position: '42', card: card({ title: 'Add the board, moved', column: 'verify' }) }),
    });
    act(() => {
      stream.emit({ kind: 'opened' });
      stream.emit({ kind: 'card-changed', position: '41', occurredAt: '2026-11-03T09:01:00.000Z', card: card({ runId: 'run-2', title: 'Other' }) });
    });
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
    act(() => {
      stream.emit({ kind: 'card-changed', position: '42', occurredAt: '2026-11-03T09:02:00.000Z', card: card({ column: 'verify' }) });
    });
    expect(await screen.findByRole('dialog', { name: 'Add the board, moved' })).toBeDefined();
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('reads the detail again after a resync, though the restored board lies below it', async () => {
    const gateway = gatewayWith(taskDetail({ position: '100' }));
    openDetail(undefined, DETAIL_PATH, gateway);
    await drawer();
    await screen.findByRole('article', { name: 'Add the board' });
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(1);
    gateway.readBoard.mockResolvedValue({ kind: 'read', value: board({ position: '20', cards: [card()] }) });
    gateway.readTaskDetail.mockResolvedValue({
      kind: 'read',
      value: taskDetail({ position: '20', card: card({ title: 'Add the board, restored' }) }),
    });
    act(() => gateway.lastStream().emit({ kind: 'resync' }));
    expect(await screen.findByRole('dialog', { name: 'Add the board, restored' })).toBeDefined();
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('reads the detail again after a resync whose board no longer holds the card', async () => {
    const gateway = gatewayWith();
    openDetail(undefined, DETAIL_PATH, gateway);
    await drawer();
    await screen.findByRole('article', { name: 'Add the board' });
    gateway.readBoard.mockResolvedValue({ kind: 'read', value: board({ position: '20', cards: [] }) });
    gateway.readTaskDetail.mockResolvedValue({ kind: 'not-found' });
    act(() => gateway.lastStream().emit({ kind: 'resync' }));
    expect(await within(screen.getByRole('dialog')).findByText('Task not found')).toBeDefined();
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('drops the detail and names the role when the board read after a stream end is denied', async () => {
    const gateway = gatewayWith();
    openDetail(undefined, DETAIL_PATH, gateway);
    await drawer();
    await screen.findByRole('article', { name: 'Add the board' });
    gateway.readBoard.mockResolvedValue({ kind: 'denied', requiredRole: 'project-viewer' });
    act(() => gateway.lastStream().emit({ kind: 'stream-ended' }));
    const detail = within(screen.getByRole('dialog'));
    expect(await detail.findByText('No access to this task')).toBeDefined();
    expect(detail.getByText(/Reading it needs the role project-viewer\./)).toBeDefined();
    expect(detail.queryByRole('region')).toBeNull();
  });

  it('drops the detail when the board cannot be read after the stream closed, and retries both', async () => {
    const gateway = gatewayWith();
    openDetail(undefined, DETAIL_PATH, gateway);
    await drawer();
    await screen.findByRole('article', { name: 'Add the board' });
    gateway.readBoard.mockResolvedValueOnce({ kind: 'unavailable' });
    act(() => gateway.lastStream().emit({ kind: 'failed' }));
    const detail = within(screen.getByRole('dialog'));
    expect(await detail.findByText('The task detail cannot be kept current')).toBeDefined();
    expect(detail.queryByRole('region')).toBeNull();
    await userEvent.click(detail.getByRole('button', { name: 'Retry' }));
    await drawer();
    expect(await screen.findByRole('article', { name: 'Add the board' })).toBeDefined();
    expect(gateway.readBoard).toHaveBeenCalledTimes(3);
    expect(gateway.readTaskDetail).toHaveBeenCalledTimes(2);
  });

  it('shows the time of its state while the live updates are lost', async () => {
    const gateway = gatewayWith();
    openDetail(undefined, DETAIL_PATH, gateway);
    const detail = await drawer();
    const stream = gateway.lastStream();
    act(() => stream.emit({ kind: 'interrupted' }));
    const notice = (await detail.findByText('Live updates lost')).closest('[role="status"]') as HTMLElement;
    expect(notice.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T09:00:00.000Z');
    expect(notice.textContent).toContain(formatInstant('2026-11-03T09:00:00.000Z'));
    act(() => stream.emit({ kind: 'opened' }));
    expect(detail.queryByText('Live updates lost')).toBeNull();
  });
});
