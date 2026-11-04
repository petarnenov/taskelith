import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TURN_TEXT_LENGTH } from '../src/agent-session/composer-model';
import { createTurnRecordStore, TURN_RECORD_PREFIX, type TurnRecord } from '../src/agent-session/turn-records';
import { CSRF_HEADER } from '../src/api/client';
import type { SubmitResult, TaskDetail } from '../src/board/board';
import { createBoardGateway, type EventSourceLike } from '../src/board/control-plane-board';
import { sessionPath } from '../src/screens';
import { createSessionGateway } from '../src/session/control-plane-session';
import type { SessionGateway } from '../src/session/session';
import {
  agentSession,
  agentSessionView,
  AUTHENTICATED,
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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const SESSION_PATH = '/app/sessions/project-1/session-1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECORD_NAME = `${TURN_RECORD_PREFIX}project-1/session-1`;
const SENT_AT = '2026-11-04T10:00:00.000Z';

// A promise the test resolves when it chooses, so no read races it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function openSession(gateway = new FakeBoardGateway(), session: SessionGateway = fakeGateway(AUTHENTICATED)) {
  return renderApp(SESSION_PATH, session, new ManualClock(), gateway);
}

async function shownSession() {
  await screen.findByRole('heading', { level: 1, name: 'Agent session session-1' });
  return within(await screen.findByRole('region', { name: 'Turns' }));
}

async function composer() {
  return within(await screen.findByRole('form', { name: 'Composer' }));
}

function message(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Message the agent' }) as HTMLTextAreaElement;
}

// The turn entries of the timeline, in the order shown.
function turnEntries(): HTMLElement[] {
  return [...screen.getByRole('region', { name: 'Turns' }).querySelectorAll<HTMLElement>('[data-turn]')];
}

function storedRecords(): TurnRecord[] {
  return JSON.parse(sessionStorage.getItem(RECORD_NAME) ?? '[]') as TurnRecord[];
}

function storedRecordNames(): string[] {
  return Object.keys(sessionStorage).filter((name) => name.startsWith(TURN_RECORD_PREFIX));
}

async function send(text: string): Promise<void> {
  await userEvent.type(message(), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

// The text of the alert whose title is shown inside the composer.
async function composerAlert(title: string): Promise<HTMLElement> {
  const form = await composer();
  const heading = await form.findByText(title);
  const alert = heading.closest('[role="alert"], [role="status"]');
  if (!(alert instanceof HTMLElement)) throw new Error(`No alert is titled ${title}.`);
  return alert;
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

describe('the composer', () => {
  it('stays visible at the end of the page as a sticky section with a 44 px send button', async () => {
    openSession();
    await shownSession();
    const form = await screen.findByRole('form', { name: 'Composer' });
    expect(form.style.position).toBe('sticky');
    expect(form.style.bottom).toMatch(/^0(px|rem)?$/);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button.style.minHeight).toBe('calc(2.75rem * var(--mantine-scale))');
    expect(screen.getByRole('main').lastElementChild?.contains(form)).toBe(true);
  });

  it('sends the trimmed text with a new key, says so meanwhile, then shows the recorded turn at once', async () => {
    const gateway = new FakeBoardGateway();
    const held = deferred<SubmitResult>();
    gateway.submitTurn.mockReturnValueOnce(held.promise);
    openSession(gateway);
    await shownSession();
    await send('  Fix the build  ');
    const [projectId, sessionId, submission] = gateway.submitTurn.mock.calls[0]!;
    expect([projectId, sessionId, submission.text]).toEqual([PROJECT.projectId, 'session-1', 'Fix the build']);
    expect(submission.idempotencyKey).toMatch(UUID);
    const sending = await composerAlert('Sending');
    expect(sending.textContent).toContain('Fix the build');
    expect(sending.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(message().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
    expect(storedRecords()).toMatchObject([{ key: submission.idempotencyKey, text: 'Fix the build' }]);
    await act(async () =>
      held.resolve({ kind: 'recorded', turn: turn({ turnId: 'turn-3', position: 3, text: 'Fix the build', state: 'queued' }) }),
    );
    await waitFor(() => expect(turnEntries().map((entry) => entry.dataset.turn)).toEqual(['turn-1', 'turn-2', 'turn-3']));
    expect(turnEntries()[2]!.textContent).toContain('Fix the build');
    expect(screen.queryByText('Sending')).toBeNull();
    expect(message().value).toBe('');
    expect(message().disabled).toBe(false);
    expect(storedRecords()).toEqual([]);
  });

  it('shows the recorded turn once when the stream later delivers it in a new state', async () => {
    const gateway = new FakeBoardGateway();
    openSession(gateway);
    await shownSession();
    await send('Fix the build');
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(turnEntries()[2]!.textContent).toContain('next turn boundary');
    act(() =>
      gateway.lastStream().emit({
        kind: 'turn-changed',
        ...at('41'),
        sessionId: 'session-1',
        turn: turn({ turnId: 'turn-3', position: 3, text: 'Fix the build', state: 'delivered', generation: 1 }),
      }),
    );
    expect(turnEntries().map((entry) => entry.dataset.turn)).toEqual(['turn-1', 'turn-2', 'turn-3']);
    expect(turnEntries()[2]!.textContent).not.toContain('next turn boundary');
  });

  it('keeps a turn answered after a move to another session out of that session, and settles its record', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockImplementation(async (_project, sessionId) => ({
      kind: 'read',
      value: agentSessionView({ session: agentSession({ sessionId }) }),
    }));
    const held = deferred<SubmitResult>();
    gateway.submitTurn.mockReturnValueOnce(held.promise);
    const view = openSession(gateway);
    await shownSession();
    await send('Fix the build');
    const [, , submission] = gateway.submitTurn.mock.calls[0]!;
    await act(() => view.router.navigate('/sessions/project-1/session-2'));
    await screen.findByRole('heading', { level: 1, name: 'Agent session session-2' });
    await waitFor(() => expect(turnEntries()).toHaveLength(2));
    await act(async () =>
      held.resolve({ kind: 'recorded', turn: turn({ turnId: 'turn-3', position: 3, text: 'Fix the build', state: 'queued' }) }),
    );
    await waitFor(() => expect(storedRecords()).toEqual([]));
    expect(turnEntries().map((entry) => entry.dataset.turn)).toEqual(['turn-1', 'turn-2']);
    expect(screen.getByRole('main').textContent).not.toContain('Fix the build');
    expect(submission.text).toBe('Fix the build');
  });

  it('shows a sending submission without a loader under reduced motion', async () => {
    await withReducedMotion(async () => {
      const gateway = new FakeBoardGateway();
      gateway.submitTurn.mockReturnValueOnce(deferred<SubmitResult>().promise);
      openSession(gateway);
      await shownSession();
      await send('Fix the build');
      const sending = await composerAlert('Sending');
      expect(sending.querySelector('.mantine-Loader-root')).toBeNull();
      expect(sending.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
  });

  it('refuses an empty message, counts the characters near the limit, and refuses one over it', async () => {
    const gateway = new FakeBoardGateway();
    openSession(gateway);
    await shownSession();
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveProperty('disabled', true);
    await userEvent.type(message(), '   ');
    expect(button).toHaveProperty('disabled', true);
    await userEvent.click(button);
    expect(gateway.submitTurn).not.toHaveBeenCalled();
    expect(screen.queryByText(/of 65,536 characters/)).toBeNull();
    fireEvent.change(message(), { target: { value: 'x'.repeat(60_000) } });
    expect(screen.getByText('60,000 of 65,536 characters')).toBeDefined();
    expect(button).toHaveProperty('disabled', false);
    fireEvent.change(message(), { target: { value: 'x'.repeat(MAX_TURN_TEXT_LENGTH + 1) } });
    expect(screen.getByText('The message is 1 character over the limit of 65,536.')).toBeDefined();
    expect(button).toHaveProperty('disabled', true);
    await userEvent.click(button);
    expect(gateway.submitTurn).not.toHaveBeenCalled();
    fireEvent.change(message(), { target: { value: `${'x'.repeat(MAX_TURN_TEXT_LENGTH)}  ` } });
    expect(button).toHaveProperty('disabled', false);
  });
});

describe('the composer while the session cannot take a turn', () => {
  it('is disabled while the session loads, and says so', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockReturnValueOnce(deferred<never>().promise);
    openSession(gateway);
    const form = await composer();
    expect(message().disabled).toBe(true);
    expect(form.getByText('The composer opens once the session is loaded.')).toBeDefined();
  });

  it('is disabled when the session could not be loaded, and says so', async () => {
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce({ kind: 'unavailable' });
    openSession(gateway);
    const form = await composer();
    await form.findByText('The session could not be loaded, so no turn can be sent.');
    expect(message().disabled).toBe(true);
  });

  it('is disabled when the session stopped at an account limit, and says so', async () => {
    const gateway = new FakeBoardGateway();
    const session = agentSession({ limit: { resetsAt: '2026-11-03T10:00:00.000Z' } });
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session }) });
    openSession(gateway);
    await shownSession();
    const form = await composer();
    expect(message().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
    expect(form.getByText('The session stopped at an account limit and accepts no turn.')).toBeDefined();
  });

  it('stays enabled while the worker is unreachable or the process state is uncertain', async () => {
    const gateway = new FakeBoardGateway();
    const detail: TaskDetail = taskDetail({ tasks: [task({ session: { state: 'process-uncertain' } })] });
    gateway.readTaskDetail.mockResolvedValue({ kind: 'read', value: detail });
    openSession(gateway);
    await shownSession();
    await screen.findByText('Process state uncertain');
    await composer();
    expect(message().disabled).toBe(false);
  });
});

describe('a retry while the composer cannot take a turn', () => {
  const restored = () =>
    sessionStorage.setItem(RECORD_NAME, JSON.stringify([{ key: 'key-restored', text: 'Sent before the reload', sentAt: SENT_AT }]));

  async function retryButton(): Promise<HTMLElement> {
    return within(await composerAlert('Not confirmed')).getByRole('button', { name: 'Retry' });
  }

  it('waits while the session loads', async () => {
    restored();
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockReturnValueOnce(deferred<never>().promise);
    openSession(gateway);
    expect(await retryButton()).toHaveProperty('disabled', true);
  });

  it('waits while the session could not be loaded', async () => {
    restored();
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockResolvedValueOnce({ kind: 'unavailable' });
    openSession(gateway);
    await (await composer()).findByText('The session could not be loaded, so no turn can be sent.');
    expect(await retryButton()).toHaveProperty('disabled', true);
  });

  it('waits while the session stopped at an account limit', async () => {
    restored();
    const gateway = new FakeBoardGateway();
    const session = agentSession({ limit: { resetsAt: '2026-11-03T10:00:00.000Z' } });
    gateway.readAgentSession.mockResolvedValue({ kind: 'read', value: agentSessionView({ session }) });
    openSession(gateway);
    await shownSession();
    expect(await retryButton()).toHaveProperty('disabled', true);
  });

  it('waits while another submission is being sent', async () => {
    sessionStorage.setItem(
      RECORD_NAME,
      JSON.stringify([
        { key: 'key-1', text: 'One', sentAt: SENT_AT },
        { key: 'key-2', text: 'Two', sentAt: SENT_AT },
      ]),
    );
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockReturnValueOnce(deferred<SubmitResult>().promise);
    openSession(gateway);
    await shownSession();
    const form = await composer();
    const [first] = form.getAllByRole('button', { name: 'Retry' });
    await userEvent.click(first!);
    await composerAlert('Sending');
    expect(form.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(form.getByRole('button', { name: 'Retry' })).toHaveProperty('disabled', true);
    expect(gateway.submitTurn).toHaveBeenCalledTimes(1);
  });

  it('waits while a 403 that named the role is shown', async () => {
    restored();
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'denied', requiredRole: 'project-operator' });
    openSession(gateway);
    await shownSession();
    await send('Fix the build');
    const denied = await composerAlert('No access');
    expect(await retryButton()).toHaveProperty('disabled', true);
    await userEvent.click(within(denied).getByRole('button', { name: 'Dismiss' }));
    expect(await retryButton()).toHaveProperty('disabled', false);
  });
});

describe('a submission that is not confirmed', () => {
  it('shows a failed submission with a retry that sends the same key again, and keeps its record meanwhile', async () => {
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'unavailable' });
    openSession(gateway);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('Not sent');
    expect(alert.textContent).toContain('Retry sends it again with the same key');
    expect(message().disabled).toBe(false);
    const [, , first] = gateway.submitTurn.mock.calls[0]!;
    expect(storedRecords().map((record) => record.key)).toEqual([first.idempotencyKey]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(gateway.submitTurn).toHaveBeenCalledTimes(2);
    expect(gateway.submitTurn.mock.calls[1]![2]).toEqual(first);
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(storedRecords()).toEqual([]);
  });

  it('shows a submission a reload left unconfirmed, and its retry sends the same key and text', async () => {
    sessionStorage.setItem(RECORD_NAME, JSON.stringify([{ key: 'key-restored', text: 'Sent before the reload', sentAt: SENT_AT }]));
    const gateway = new FakeBoardGateway();
    openSession(gateway);
    await shownSession();
    const alert = await composerAlert('Not confirmed');
    expect(alert.textContent).toContain('Sent before the reload');
    expect(alert.textContent).toContain('before the page was reloaded');
    expect(gateway.submitTurn).not.toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(gateway.submitTurn).toHaveBeenCalledWith(PROJECT.projectId, 'session-1', {
      idempotencyKey: 'key-restored',
      text: 'Sent before the reload',
    });
    expect(storedRecords()).toEqual([]);
  });

  it('shows the submissions of a/b + c to no composer of a + b/c, whose feed reads its own session', async () => {
    const store = createTurnRecordStore();
    store.add('a/b', 'c', { key: 'key-restored', text: 'Sent to a/b + c', sentAt: SENT_AT });
    const gateway = new FakeBoardGateway();
    gateway.readAgentSession.mockImplementation(async (_project, sessionId) => ({
      kind: 'read',
      value: agentSessionView({ session: agentSession({ sessionId }) }),
    }));
    const view = renderApp(`/app${sessionPath('a/b', 'c')}`, fakeGateway(AUTHENTICATED), new ManualClock(), gateway, store);
    await screen.findByRole('heading', { level: 1, name: 'Agent session c' });
    await composerAlert('Not confirmed');
    await act(() => view.router.navigate(sessionPath('a', 'b/c')));
    await screen.findByRole('heading', { level: 1, name: 'Agent session b/c' });
    await waitFor(() => expect(gateway.readAgentSession).toHaveBeenCalledWith('a', 'b/c'));
    await waitFor(() => expect(screen.getByRole('main').textContent).toContain('Agent session b/c'));
    expect(screen.queryByText('Not confirmed')).toBeNull();
    expect(message().disabled).toBe(false);
  });

  it('keeps the records of a session whose storage cannot be reached in memory for a retry', async () => {
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'unavailable' });
    const records = createTurnRecordStore(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });
    renderApp(SESSION_PATH, fakeGateway(AUTHENTICATED), new ManualClock(), gateway, records);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('Not sent');
    const [, , first] = gateway.submitTurn.mock.calls[0]!;
    expect(records.list(PROJECT.projectId, 'session-1').map((record) => record.key)).toEqual([first.idempotencyKey]);
    expect(storedRecordNames()).toEqual([]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(records.list(PROJECT.projectId, 'session-1')).toEqual([]);
  });
});

describe('a submission the control plane settled otherwise', () => {
  it('shows a duplicate as the turn the control plane had recorded, and clears its record', async () => {
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'duplicate', turn: turnPage().turns[1]! });
    openSession(gateway);
    await shownSession();
    await send('Continue');
    const alert = await composerAlert('Already recorded');
    expect(alert.textContent).toContain('turn #2');
    expect(storedRecords()).toEqual([]);
    expect(turnEntries()).toHaveLength(2);
    await userEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Already recorded')).toBeNull();
    expect(message().disabled).toBe(false);
  });

  it.each([
    [{ kind: 'key-reused' }, 'Key reused', 'knows this key for another message'],
    [{ kind: 'session-stopped' }, 'Session stopped', 'stopped at an account limit'],
    [{ kind: 'not-found' }, 'Session not found', 'knows no such agent session'],
    [{ kind: 'invalid' }, 'Refused', 'refused the message as invalid'],
  ] as const)('shows %o as a refusal with no retry, and clears its record', async (result, title, text) => {
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce(result);
    openSession(gateway);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert(title);
    expect(alert.textContent).toContain(text);
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(storedRecords()).toEqual([]);
    expect(turnEntries()).toHaveLength(2);
    await userEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(title)).toBeNull();
  });

  it('names the role a 403 names and takes no turn until the notice is dismissed', async () => {
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'denied', requiredRole: 'project-operator' });
    openSession(gateway);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('No access');
    expect(alert.textContent).toContain('Sending a turn needs the role project-operator.');
    expect(message().disabled).toBe(true);
    expect(storedRecords()).toEqual([]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(message().disabled).toBe(false);
  });

  it('says that no role allows a turn when the 403 names none', async () => {
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'denied' });
    openSession(gateway);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('No access');
    expect(alert.textContent).toContain('You hold no role on this project that lets you send a turn.');
    expect(alert.textContent).not.toContain('needs the role');
  });
});

describe('a submission refused for its token', () => {
  it('reads the session again once and sends again with the same key', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'csrf-rejected' });
    openSession(gateway, session);
    await shownSession();
    expect(session.read).toHaveBeenCalledTimes(1);
    await send('Fix the build');
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(session.read).toHaveBeenCalledTimes(2);
    expect(gateway.submitTurn).toHaveBeenCalledTimes(2);
    const [first, second] = gateway.submitTurn.mock.calls.map((call) => call[2]);
    expect(second).toEqual(first);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(storedRecords()).toEqual([]);
  });

  it('shows a second refusal, sends nothing more for that key, and clears its record', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValue({ kind: 'csrf-rejected' });
    openSession(gateway, session);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('Refused');
    expect(alert.textContent).toContain('refused the request’s token twice');
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(gateway.submitTurn).toHaveBeenCalledTimes(2);
    expect(session.read).toHaveBeenCalledTimes(2);
    expect(storedRecords()).toEqual([]);
    expect(message().disabled).toBe(false);
  });

  it('reads the session again once per key, whatever failures and retries come between the two refusals', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = new FakeBoardGateway();
    gateway.submitTurn
      .mockResolvedValueOnce({ kind: 'csrf-rejected' })
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'csrf-rejected' });
    openSession(gateway, session);
    await shownSession();
    await send('Fix the build');
    const failed = await composerAlert('Not sent');
    expect(gateway.submitTurn).toHaveBeenCalledTimes(2);
    expect(session.read).toHaveBeenCalledTimes(2);
    expect(storedRecords()).toMatchObject([{ tokenRefreshed: true }]);
    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    const refused = await composerAlert('Refused');
    expect(refused.textContent).toContain('refused the request’s token twice');
    expect(gateway.submitTurn).toHaveBeenCalledTimes(3);
    expect(session.read).toHaveBeenCalledTimes(2);
    expect(storedRecords()).toEqual([]);
  });

  it('gives each key its own session read', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = new FakeBoardGateway();
    const recorded = (position: number): SubmitResult => ({ kind: 'recorded', turn: turn({ turnId: `turn-${position}`, position, state: 'queued' }) });
    gateway.submitTurn
      .mockResolvedValueOnce({ kind: 'csrf-rejected' })
      .mockResolvedValueOnce(recorded(3))
      .mockResolvedValueOnce({ kind: 'csrf-rejected' })
      .mockResolvedValueOnce(recorded(4));
    openSession(gateway, session);
    await shownSession();
    await send('One');
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    await send('Two');
    await waitFor(() => expect(turnEntries()).toHaveLength(4));
    expect(gateway.submitTurn).toHaveBeenCalledTimes(4);
    expect(session.read).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps a spent session read across a reload, so the next refusal of the key is final', async () => {
    sessionStorage.setItem(RECORD_NAME, JSON.stringify([{ key: 'key-restored', text: 'Sent before', sentAt: SENT_AT, tokenRefreshed: true }]));
    const session = fakeGateway(AUTHENTICATED);
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValue({ kind: 'csrf-rejected' });
    openSession(gateway, session);
    await shownSession();
    const alert = await composerAlert('Not confirmed');
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await composerAlert('Refused');
    expect(gateway.submitTurn).toHaveBeenCalledTimes(1);
    expect(session.read).toHaveBeenCalledTimes(1);
    expect(storedRecords()).toEqual([]);
  });

  it.each([
    ['could not be read', { kind: 'unavailable' } as const],
    ['read threw', new Error('offline')],
  ])('keeps the key for a retry when the session %s again, and sends nothing meanwhile', async (_, read) => {
    const session = fakeGateway(AUTHENTICATED);
    if (read instanceof Error) session.read.mockResolvedValueOnce(AUTHENTICATED).mockRejectedValueOnce(read);
    else session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(read);
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'csrf-rejected' });
    openSession(gateway, session);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('Not sent');
    expect(alert.textContent).toContain('the session could not be read again to renew it');
    expect(gateway.submitTurn).toHaveBeenCalledTimes(1);
    expect(session.read).toHaveBeenCalledTimes(2);
    const [, , first] = gateway.submitTurn.mock.calls[0]!;
    expect(storedRecords().map((record) => record.key)).toEqual([first.idempotencyKey]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(gateway.submitTurn.mock.calls[1]![2]).toEqual(first);
    expect(storedRecords()).toEqual([]);
  });

  it('shows the sign-in page when the session had ended by the time it was read again', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValue({ kind: 'anonymous' });
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValue({ kind: 'csrf-rejected' });
    openSession(gateway, session);
    await shownSession();
    await send('Fix the build');
    expect(await screen.findByText('Your session expired')).toBeDefined();
  });
});

describe('the records and the shell session', () => {
  it('shows the sign-in page with the expired notice on an unauthenticated answer, and clears the records', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const gateway = new FakeBoardGateway();
    gateway.submitTurn.mockResolvedValueOnce({ kind: 'unauthenticated' });
    openSession(gateway, session);
    await shownSession();
    await send('Fix the build');
    expect(await screen.findByText('Your session expired')).toBeDefined();
    await waitFor(() => expect(storedRecordNames()).toEqual([]));
  });

  it('clears the records of every session on sign out', async () => {
    sessionStorage.setItem(RECORD_NAME, JSON.stringify([{ key: 'key-1', text: 'One', sentAt: SENT_AT }]));
    sessionStorage.setItem(`${TURN_RECORD_PREFIX}project-2/session-9`, JSON.stringify([{ key: 'key-2', text: 'Two', sentAt: SENT_AT }]));
    sessionStorage.setItem('other', 'kept');
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    openSession(new FakeBoardGateway(), session);
    await shownSession();
    await composerAlert('Not confirmed');
    expect(storedRecordNames()).toHaveLength(2);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('You signed out')).toBeDefined();
    await waitFor(() => expect(storedRecordNames()).toEqual([]));
    expect(sessionStorage.getItem('other')).toBe('kept');
  });
});

describe('the token on the wire', () => {
  const TOKEN = 'c'.repeat(43);
  const SESSION = {
    state: 'authenticated',
    csrfToken: TOKEN,
    principal: { principalId: 'p-1', loginName: 'operator' },
    installationRoles: ['installation-owner'],
    expiresAt: '2026-11-04T11:00:00.000Z',
  };
  const STAMP = { asOf: '2026-11-03T09:00:00.000Z', position: '40' };

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  // A control plane that answers the session screen's reads and a submit.
  function controlPlane() {
    const posts: Headers[] = [];
    const send = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/turns')) {
        posts.push(new Headers(init?.headers));
        const { text } = JSON.parse(String(init?.body)) as { text: string };
        return json(201, { effect: 'recorded', turn: turn({ turnId: 'turn-3', position: 3, text, state: 'queued' }) });
      }
      if (url === '/session') return json(200, SESSION);
      if (url === '/projects' || url.startsWith('/projects?')) return json(200, { projects: [PROJECT] });
      if (url.endsWith('/agent-sessions/session-1')) return json(200, agentSessionView());
      if (url.includes('/agent-sessions/session-1/turns')) return json(200, turnPage());
      if (url.endsWith('/cards/run-1')) return json(200, { ...STAMP, ...taskDetail() });
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    const stillStream: EventSourceLike = { readyState: 1, addEventListener: () => {}, close: () => {} };
    return { send, posts, openEventSource: () => stillStream };
  }

  it('sends the session token with the turn and writes it nowhere the page, the storage, or the console shows', async () => {
    const plane = controlPlane();
    const session = createSessionGateway(plane.send);
    const board = createBoardGateway({ fetch: plane.send, csrfToken: session.csrfToken, openEventSource: plane.openEventSource });
    const consoleCalls: unknown[][] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
        consoleCalls.push(args);
      }),
    );
    try {
      renderApp(SESSION_PATH, session, new ManualClock(), board);
      await shownSession();
      await send('Fix the build');
      await waitFor(() => expect(turnEntries()).toHaveLength(3));
      expect(plane.posts.map((headers) => headers.get(CSRF_HEADER))).toEqual([TOKEN]);
      expect(document.documentElement.outerHTML).not.toContain(TOKEN);
      const stored = [...Object.values(sessionStorage), ...Object.values(localStorage)].join('\n');
      expect(stored).not.toContain(TOKEN);
      expect(JSON.stringify(consoleCalls)).not.toContain(TOKEN);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('sends the key again only with a token a renewed session read gave, never the refused one', async () => {
    const plane = controlPlane();
    const RENEWED = 'd'.repeat(43);
    const csrfRefusal = () => json(403, { code: 'forbidden', message: 'Refused.', details: { reason: 'csrf-token-invalid' } });
    const sessionReads: Response[] = [json(200, SESSION), json(503, { code: 'unavailable', message: 'Later.', details: {} })];
    const posts: Response[] = [csrfRefusal(), csrfRefusal()];
    const fallback = plane.send.getMockImplementation()!;
    plane.send.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/session') return sessionReads.shift() ?? json(200, { ...SESSION, csrfToken: RENEWED });
      if ((init?.method ?? 'GET') === 'POST' && url.endsWith('/turns')) {
        plane.posts.push(new Headers(init?.headers));
        return posts.shift() ?? json(201, { effect: 'recorded', turn: turn({ turnId: 'turn-3', position: 3, text: 'Fix the build', state: 'queued' }) });
      }
      return fallback(input, init);
    });
    const session = createSessionGateway(plane.send);
    const board = createBoardGateway({ fetch: plane.send, csrfToken: session.csrfToken, openEventSource: plane.openEventSource });
    renderApp(SESSION_PATH, session, new ManualClock(), board);
    await shownSession();
    await send('Fix the build');
    const alert = await composerAlert('Not sent');
    expect(plane.posts.map((headers) => headers.get(CSRF_HEADER))).toEqual([TOKEN]);
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(turnEntries()).toHaveLength(3));
    expect(plane.posts.map((headers) => headers.get(CSRF_HEADER))).toEqual([TOKEN, TOKEN, RENEWED]);
  });
});
