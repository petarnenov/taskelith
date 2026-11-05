import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '../src/api/client';
import type { ReadResult } from '../src/api/read-result';
import { createBoardGateway } from '../src/board/control-plane-board';
import { createSessionGateway } from '../src/session/control-plane-session';
import { EXPIRY_MARGIN_MILLISECONDS } from '../src/session/SessionProvider';
import type { SessionRead } from '../src/session/session';
import { createWorkersGateway } from '../src/workers/control-plane-workers';
import type { EnrollmentTokenList, IssueResult, RevokeResult } from '../src/workers/workers';
import {
  AUTHENTICATED,
  enrollmentToken,
  fakeGateway,
  FakeWorkersGateway,
  HOUR,
  issuedToken,
  ManualClock,
  OPERATOR,
  renderApp,
  tokenList,
  TOKEN_SECRET,
  workersView,
} from './fakes';

// Every console argument of a test: the section writes nothing to the
// console, and React's warnings count as unexpected output.
let consoleCalls: unknown[][] = [];
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

// The board's index route of 29b has no element by design; the router
// notes it at /app/ before this screen opens, so that one note is expected.
const BOARD_INDEX_NOTE = /^Matched leaf route at location "\/" does not have an element/;

function unexpectedConsoleCalls(): unknown[][] {
  return consoleCalls.filter((args) => !(args.length === 1 && typeof args[0] === 'string' && BOARD_INDEX_NOTE.test(args[0])));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  consoleCalls = [];
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
    vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    }),
  );
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  removeClipboard();
  for (const spy of consoleSpies) spy.mockRestore();
  expect(unexpectedConsoleCalls()).toEqual([]);
});

const WORKERS_PATH = '/app/workers';
const VIEWER: SessionRead = { kind: 'authenticated', operator: { ...OPERATOR, installationRoles: [] } };
const OTHER_OWNER: SessionRead = { kind: 'authenticated', operator: { ...OPERATOR, loginName: 'other-owner' } };
const EXPIRY_CHECK = HOUR + EXPIRY_MARGIN_MILLISECONDS;
const SECRET_SHAPE = 'tken_';

// user-event's setup attaches its own clipboard to the window; the tests of
// the copy replace it after the setup with one that records or refuses.
function stubClipboard(writeText = vi.fn(async (_text: string) => {})) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

function removeClipboard(): void {
  delete (navigator as { clipboard?: unknown }).clipboard;
}

// A promise the test resolves when it chooses, so no answer races it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function gatewayWith(...lists: ReadResult<EnrollmentTokenList>[]): FakeWorkersGateway {
  const gateway = new FakeWorkersGateway();
  for (const list of lists) gateway.listEnrollmentTokens.mockResolvedValueOnce(list);
  return gateway;
}

function openTokens(gateway = new FakeWorkersGateway(), session = fakeGateway(AUTHENTICATED)) {
  return renderApp(WORKERS_PATH, session, new ManualClock(), undefined, undefined, gateway);
}

async function shownTokens() {
  const region = await screen.findByRole('region', { name: 'Enrollment tokens' });
  await within(region).findAllByRole('button', { name: 'Refresh tokens' });
  return within(region);
}

async function cardOf(tokenId: string) {
  const region = await shownTokens();
  return within(await region.findByRole('article', { name: tokenId }));
}

async function openForm(user = userEvent.setup()) {
  await shownTokens();
  await user.click(screen.getByRole('button', { name: 'Enroll a worker' }));
  return { user, form: within(await screen.findByRole('form', { name: 'Enroll a worker' })) };
}

async function issueToken(user = userEvent.setup()) {
  const { form } = await openForm(user);
  await user.click(form.getByRole('button', { name: 'Issue token' }));
  const dialog = await screen.findByRole('dialog', { name: 'Enrollment token issued' });
  return { user, dialog: within(dialog) };
}

async function confirm(tokenId: string, action: 'Revoke' | 'Rotate') {
  const user = userEvent.setup();
  const card = await cardOf(tokenId);
  await user.click(card.getByRole('button', { name: action }));
  const dialog = within(await screen.findByRole('dialog', { name: `${action} token` }));
  await user.click(dialog.getByRole('button', { name: action }));
  return user;
}

function noticeOf(title: string): HTMLElement {
  const notice = screen.getByText(title).closest('[role="status"]');
  if (!(notice instanceof HTMLElement)) throw new Error(`No status region titled ${title}.`);
  return notice;
}

function expectNoSecret(): void {
  expect(document.documentElement.outerHTML).not.toContain(SECRET_SHAPE);
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(0);
  const logged = consoleCalls.flat().map((arg) => (arg instanceof Error ? (arg.stack ?? arg.message) : arg));
  expect(JSON.stringify(logged)).not.toContain(SECRET_SHAPE);
  expect(unexpectedConsoleCalls()).toEqual([]);
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

const DARWIN_ARM = enrollmentToken({ tokenId: 'token-2', constraints: { platform: 'darwin', architecture: 'arm64', hostname: 'mac-1.example' } });

describe('the enrollment tokens section', () => {
  it('lists every pending token with its identifier, times, constraints, and the Rotate and Revoke buttons', async () => {
    openTokens(gatewayWith(tokenList([enrollmentToken(), DARWIN_ARM])));
    const region = await shownTokens();
    expect(region.getAllByRole('article').map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual(['token-1', 'token-2']);
    const first = await cardOf('token-1');
    expect(first.getByText(/Issued/).textContent).toBe(
      `Issued ${new Date(enrollmentToken().issuedAt).toLocaleString()}, expires ${new Date(enrollmentToken().expiresAt).toLocaleString()}`,
    );
    expect(first.getByText(/Issued/).querySelectorAll('time')[1]?.getAttribute('datetime')).toBe(enrollmentToken().expiresAt);
    expect(first.getByText('Any platform, any architecture, any hostname')).toBeDefined();
    expect(first.getByRole('button', { name: 'Rotate' })).toBeDefined();
    expect(first.getByRole('button', { name: 'Revoke' })).toBeDefined();
    const second = await cardOf('token-2');
    expect(second.getByText(/macOS, arm64, hostname/).textContent).toBe('macOS, arm64, hostname mac-1.example');
    expect(screen.getByRole('region', { name: 'Enrollment tokens' }).id).toBe('enrollment-tokens');
    expect(screen.getByRole('heading', { level: 2, name: 'Enrollment tokens' })).toBeDefined();
  });

  it('says that no token is pending for an empty list', async () => {
    openTokens(gatewayWith(tokenList()));
    const region = await shownTokens();
    expect(region.getByText('No pending token.')).toBeDefined();
    expect(region.queryAllByRole('article')).toEqual([]);
  });

  it('says that the list was cut short when the page limit stopped the read', async () => {
    openTokens(gatewayWith(tokenList([enrollmentToken()], true)));
    const region = await shownTokens();
    expect(region.getByRole('status').textContent).toBe('Only the first 100 pages of pending tokens are shown; the list is cut short.');
    expect(region.getAllByRole('article')).toHaveLength(1);
  });

  it('shows no truncation note for a list read to its end', async () => {
    openTokens(gatewayWith(tokenList([enrollmentToken()])));
    const region = await shownTokens();
    expect(region.queryByText(/cut short/)).toBeNull();
  });

  it('reads the tokens again on Refresh tokens and keeps the shown list until the answer', async () => {
    const later = deferred<ReadResult<EnrollmentTokenList>>();
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    gateway.listEnrollmentTokens.mockReturnValueOnce(later.promise);
    openTokens(gateway);
    const region = await shownTokens();
    await userEvent.click(region.getByRole('button', { name: 'Refresh tokens' }));
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Refreshing the tokens…')).toBeDefined();
    expect(region.getByRole('article', { name: 'token-1' })).toBeDefined();
    later.resolve(tokenList([DARWIN_ARM]));
    expect(await region.findByRole('article', { name: 'token-2' })).toBeDefined();
    expect(region.queryByRole('article', { name: 'token-1' })).toBeNull();
    expect(screen.queryByText('Refreshing the tokens…')).toBeNull();
  });

  it('shows why a read failed, with a Retry that reads again, while the workers stay shown', async () => {
    const gateway = gatewayWith({ kind: 'unavailable' }, tokenList());
    openTokens(gateway);
    expect(await screen.findByText('The enrollment tokens cannot be loaded')).toBeDefined();
    expect(screen.getByText(/none is shown rather than a list that may be wrong/)).toBeDefined();
    expect(screen.getByRole('region', { name: 'Workers' })).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await shownTokens();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2);
  });

  it('shows the denied state with the role a 403 names', async () => {
    openTokens(gatewayWith({ kind: 'denied', requiredRole: 'installation-owner' }));
    expect(await screen.findByText('No access to the enrollment tokens')).toBeDefined();
    expect(screen.getByText(/Reading it needs the role installation-owner\./)).toBeDefined();
  });

  it('shows the sign-in page after a 401 unauthenticated', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    openTokens(gatewayWith({ kind: 'unauthenticated' }), session);
    expect(await screen.findByText('Your session expired')).toBeDefined();
    await waitFor(() => expect(session.read).toHaveBeenCalledTimes(2));
  });

  it('reads nothing without the installation-owner role', async () => {
    const gateway = new FakeWorkersGateway();
    openTokens(gateway, fakeGateway(VIEWER));
    expect(await screen.findByText('Needs installation-owner')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Enrollment tokens' })).toBeNull();
    expect(gateway.listEnrollmentTokens).not.toHaveBeenCalled();
  });

  it('names what loads and shows no loader under reduced motion', async () => {
    await withReducedMotion(async () => {
      const later = deferred<ReadResult<EnrollmentTokenList>>();
      const gateway = new FakeWorkersGateway();
      gateway.listEnrollmentTokens.mockReturnValueOnce(later.promise);
      openTokens(gateway);
      expect(await screen.findByText('Loading the enrollment tokens…')).toBeDefined();
      expect(spinnerOf('Loading the enrollment tokens…')).toBeNull();
      later.resolve(tokenList());
      await shownTokens();
    });
  });

  it('keeps every control focusable and named, the identifier breakable at phone width', async () => {
    openTokens(gatewayWith(tokenList([enrollmentToken({ tokenId: 'e'.repeat(33) })])));
    const card = await cardOf('e'.repeat(33));
    const heading = card.getByRole('heading', { level: 3 });
    expect(heading.textContent).toBe('e'.repeat(33));
    expect(heading.querySelectorAll('wbr')).toHaveLength(2);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      expect(control.getAttribute('aria-label') ?? control.textContent).not.toBe('');
    }
  });
});

describe('issuing a token', () => {
  it('opens the form in place, which names the environment variable and no command line', async () => {
    openTokens();
    const { form } = await openForm();
    expect(screen.getByRole('button', { name: 'Enroll a worker' }).getAttribute('aria-expanded')).toBe('true');
    const steps = screen.getByRole('form', { name: 'Enroll a worker' }).textContent ?? '';
    expect(steps).toContain('TASKELITH_ENROLLMENT_TOKEN');
    expect(steps).not.toMatch(/taskelith\s+\S/);
    expect(form.getByLabelText('Platform')).toBeDefined();
    expect(form.getByLabelText('Architecture')).toBeDefined();
    expect(form.getByLabelText('Hostname')).toBeDefined();
  });

  it('closes the form again from the same button', async () => {
    openTokens();
    const { user } = await openForm();
    await user.click(screen.getByRole('button', { name: 'Enroll a worker' }));
    expect(screen.queryByRole('form', { name: 'Enroll a worker' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enroll a worker' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('sends no constraint for an empty form and shows the issued token once with its secret', async () => {
    const gateway = gatewayWith(tokenList(), tokenList([enrollmentToken()]));
    openTokens(gateway);
    const { dialog } = await issueToken();
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledWith({});
    expect(dialog.getByLabelText('Enrollment token secret')).toHaveProperty('value', TOKEN_SECRET);
    expect(dialog.getByLabelText('Enrollment token secret')).toHaveProperty('readOnly', true);
    expect(dialog.getByText(/is valid for 15 minutes, until/).textContent).toContain(new Date(enrollmentToken().expiresAt).toLocaleString());
    expect(dialog.getByText(/is valid for/).textContent).toContain('Any platform, any architecture, any hostname');
    expect(dialog.getByText(/TASKELITH_ENROLLMENT_TOKEN/).textContent).toContain('TASKELITH_INSTALLATION_CA_SHA256');
    expect(dialog.getByText(/TASKELITH_ENROLLMENT_TOKEN/).textContent).not.toMatch(/taskelith\s+\S/);
    expect(dialog.getByText('This secret is shown only now; Taskelith keeps only its hash. Copy it before you close this dialog.')).toBeDefined();
    await waitFor(() => expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2));
    expect(await (await cardOf('token-1')).findByRole('button', { name: 'Revoke' })).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Enrollment token issued' })).toBeDefined();
  });

  it('sends the chosen constraints, the hostname trimmed', async () => {
    const gateway = new FakeWorkersGateway();
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.selectOptions(form.getByLabelText('Platform'), 'darwin');
    await user.selectOptions(form.getByLabelText('Architecture'), 'arm64');
    await user.type(form.getByLabelText('Hostname'), ' mac-1.example ');
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await screen.findByRole('dialog', { name: 'Enrollment token issued' });
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledWith({ platform: 'darwin', architecture: 'arm64', hostname: 'mac-1.example' });
  });

  it('refuses a hostname with a control character before it is sent', async () => {
    const gateway = new FakeWorkersGateway();
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.type(form.getByLabelText('Hostname'), 'build\u0007');
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect(await form.findByText('A hostname is 1 to 1,024 characters without control characters.')).toBeDefined();
    expect(gateway.issueEnrollmentToken).not.toHaveBeenCalled();
  });

  it('clears the hostname error once the field is changed', async () => {
    const gateway = new FakeWorkersGateway();
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.type(form.getByLabelText('Hostname'), 'build\u0007');
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await form.findByText('A hostname is 1 to 1,024 characters without control characters.');
    await user.type(form.getByLabelText('Hostname'), '{Backspace}');
    expect(form.queryByText('A hostname is 1 to 1,024 characters without control characters.')).toBeNull();
    expect(gateway.issueEnrollmentToken).not.toHaveBeenCalled();
  });

  it('runs one command at a time: every button says so and a second click sends nothing', async () => {
    const later = deferred<IssueResult>();
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    gateway.issueEnrollmentToken.mockReturnValueOnce(later.promise);
    openTokens(gateway);
    const { user, form } = await openForm();
    const issue = form.getByRole('button', { name: 'Issue token' });
    await user.click(issue);
    expect(await screen.findByText('Issuing a token…')).toBeDefined();
    const card = await cardOf('token-1');
    for (const button of [issue, card.getByRole('button', { name: 'Rotate' }), card.getByRole('button', { name: 'Revoke' })]) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    }
    await user.click(issue);
    await user.click(card.getByRole('button', { name: 'Revoke' }));
    await user.click(card.getByRole('button', { name: 'Rotate' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledTimes(1);
    later.resolve({ kind: 'issued', value: issuedToken() });
    await screen.findByRole('dialog', { name: 'Enrollment token issued' });
    expect(screen.queryByText('Issuing a token…')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Revoke token' })).toBeNull();
    expect(gateway.revokeEnrollmentToken).not.toHaveBeenCalled();
    expect(gateway.rotateEnrollmentToken).not.toHaveBeenCalled();
    expect(issue.getAttribute('aria-disabled')).toBeNull();
  });

  it('refuses the request as invalid when the control plane answers 400', async () => {
    const gateway = new FakeWorkersGateway();
    gateway.issueEnrollmentToken.mockResolvedValueOnce({ kind: 'invalid' });
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect((await screen.findByText('Not issued')).closest('[role="status"]')?.textContent).toContain('refused the request as invalid; nothing was issued');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
  });

  it('shows the denied state with the role after a 403, without reading the list again', async () => {
    const gateway = new FakeWorkersGateway();
    gateway.issueEnrollmentToken.mockResolvedValueOnce({ kind: 'denied', requiredRole: 'installation-owner' });
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect(noticeOf('No access to issue tokens').textContent).toBe(
      'No access to issue tokensYour session holds no role that lets you issue enrollment tokens; nothing was issued. It needs the role installation-owner.',
    );
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a list cut short', tokenList([DARWIN_ARM], true)],
    ['a list the token already left, as when it expired', tokenList()],
  ])('says that a token may have been issued but not shown after no answer, with a Refresh and no Retry, also after %s', async (_, refreshed) => {
    const gateway = gatewayWith(tokenList(), refreshed);
    gateway.issueEnrollmentToken.mockResolvedValueOnce({ kind: 'unavailable' });
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    const notice = within(await screen.findByText('Not issued, or issued but not shown').then((title) => title.closest('[role="status"]') as HTMLElement));
    expect(notice.getByText(/a token may have been issued even though its secret was not shown/)).toBeDefined();
    expect(notice.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
    await user.click(notice.getByRole('button', { name: 'Refresh the list' }));
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText('Refreshing the tokens…')).toBeNull());
    expect(notice.getByText(/A token missing from the list may still have been issued/)).toBeDefined();
    expect(notice.queryByText(/was not issued/)).toBeNull();
  });

  it('shows the sign-in page after a 401 unauthenticated', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const gateway = new FakeWorkersGateway();
    gateway.issueEnrollmentToken.mockResolvedValueOnce({ kind: 'unauthenticated' });
    openTokens(gateway, session);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect(await screen.findByText('Your session expired')).toBeDefined();
  });
});

describe('the revealed secret', () => {
  it('is copied to the clipboard, and nothing else is, with "Copied" announced', async () => {
    openTokens();
    const user = userEvent.setup();
    const writeText = stubClipboard();
    const { dialog } = await issueToken(user);
    await user.click(dialog.getByRole('button', { name: 'Copy' }));
    expect(await dialog.findByRole('button', { name: 'Copied' })).toBeDefined();
    expect(dialog.getByRole('status').textContent).toBe('Copied to the clipboard.');
    expect(dialog.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(writeText.mock.calls).toEqual([[TOKEN_SECRET]]);
  });

  it('says to select the text when the clipboard refuses, and keeps the secret selectable', async () => {
    openTokens();
    const user = userEvent.setup();
    stubClipboard(vi.fn(async () => Promise.reject(new DOMException('Denied', 'NotAllowedError'))));
    const { dialog } = await issueToken(user);
    await user.click(dialog.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(dialog.getByRole('status').textContent).toBe('Could not copy; select the text and copy it.'));
    expect(dialog.getByRole('button', { name: 'Copy' })).toBeDefined();
    expect(dialog.getByLabelText('Enrollment token secret')).toHaveProperty('value', TOKEN_SECRET);
  });

  it('says so too when the browser has no clipboard', async () => {
    openTokens();
    const user = userEvent.setup();
    removeClipboard();
    const { dialog } = await issueToken(user);
    await user.click(dialog.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(dialog.getByRole('status').textContent).toBe('Could not copy; select the text and copy it.'));
  });

  it('leaves the page, the storages, and the console once closed after a copy, and the focus goes to the notice', async () => {
    openTokens();
    const user = userEvent.setup();
    stubClipboard();
    const { dialog } = await issueToken(user);
    await user.click(dialog.getByRole('button', { name: 'Copy' }));
    await dialog.findByRole('button', { name: 'Copied' });
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
    const notice = noticeOf('Token issued');
    expect(notice.textContent).toContain('Token token-1 was issued and shown once with its secret.');
    await waitFor(() => expect(document.activeElement).toBe(notice));
  });

  it('asks before closing without a copy, keeps the dialog on Keep open, and clears the secret on Close anyway', async () => {
    openTokens();
    const { user, dialog } = await issueToken();
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(dialog.getByText('Close without copying?')).toBeDefined();
    expect(dialog.getByText('The secret cannot be shown again.')).toBeDefined();
    // The red light button would have no boundary on the red light alert.
    for (const name of ['Keep open', 'Close anyway']) {
      expect(dialog.getByRole('button', { name }).closest('.mantine-Alert-root')).toBeNull();
    }
    await user.click(dialog.getByRole('button', { name: 'Keep open' }));
    expect(dialog.queryByText('Close without copying?')).toBeNull();
    expect(dialog.getByLabelText('Enrollment token secret')).toHaveProperty('value', TOKEN_SECRET);
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    await user.click(dialog.getByRole('button', { name: 'Close anyway' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
  });

  it('does not close or ask on Escape', async () => {
    openTokens();
    const { user, dialog } = await issueToken();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Enrollment token issued' })).toBeDefined();
    expect(dialog.queryByText('Close without copying?')).toBeNull();
  });

  it('does not close or ask on a click outside it', async () => {
    openTokens();
    const { user, dialog } = await issueToken();
    const overlay = document.querySelector('.mantine-Modal-overlay');
    if (!(overlay instanceof HTMLElement)) throw new Error('The reveal has no overlay.');
    await user.click(overlay);
    expect(screen.getByRole('dialog', { name: 'Enrollment token issued' })).toBeDefined();
    expect(dialog.queryByText('Close without copying?')).toBeNull();
  });

  it('is replaced by the secret of a rotation, and no earlier secret stays on the page', async () => {
    const first = `tken_${'a'.repeat(43)}`;
    const second = `tken_${'b'.repeat(43)}`;
    const gateway = gatewayWith(tokenList(), tokenList([enrollmentToken()]), tokenList([enrollmentToken({ tokenId: 'token-1-rotated' })]));
    gateway.issueEnrollmentToken.mockResolvedValueOnce({ kind: 'issued', value: issuedToken({ secret: first }) });
    gateway.rotateEnrollmentToken.mockResolvedValueOnce({ kind: 'issued', value: issuedToken({ token: enrollmentToken({ tokenId: 'token-1-rotated' }), secret: second }) });
    openTokens(gateway);
    const { user, dialog } = await issueToken();
    expect(document.documentElement.outerHTML).toContain(first);
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    await user.click(dialog.getByRole('button', { name: 'Close anyway' }));
    await confirm('token-1', 'Rotate');
    const rotated = within(await screen.findByRole('dialog', { name: 'Token rotated' }));
    expect(rotated.getByLabelText('Enrollment token secret')).toHaveProperty('value', second);
    expect(rotated.getByText(/stops working now/).textContent).toContain('Token token-1 stops working now. Token token-1-rotated is valid for 15 minutes');
    expect(document.documentElement.outerHTML).not.toContain(first);
    await user.click(rotated.getByRole('button', { name: 'Close' }));
    await user.click(rotated.getByRole('button', { name: 'Close anyway' }));
    expectNoSecret();
    expect(noticeOf('Token rotated').textContent).toContain('its replacement token-1-rotated was shown once');
  });

  it('is dropped when the operator leaves the screen, and the list shows no reveal on return', async () => {
    const gateway = gatewayWith(tokenList(), tokenList([enrollmentToken()]), tokenList([enrollmentToken()]));
    const { router } = openTokens(gateway);
    await issueToken();
    await act(async () => {
      await router.navigate('/');
    });
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
    await act(async () => {
      await router.navigate('/workers');
    });
    await cardOf('token-1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/Token issued/)).toBeNull();
    expectNoSecret();
  });

  it('is dropped by a sign-out', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValue({ kind: 'anonymous' });
    openTokens(new FakeWorkersGateway(), session);
    const { user } = await issueToken();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(session.logOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
  });

  it('is dropped when the session ends', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const { clock } = openTokens(new FakeWorkersGateway(), session);
    await issueToken();
    act(() => clock.advance(EXPIRY_CHECK));
    expect(await screen.findByText('Your session expired')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
  });

  it('is dropped when another owner signs in, and the earlier one’s notice does not reach the new owner', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(OTHER_OWNER);
    const { clock } = openTokens(new FakeWorkersGateway(), session);
    await issueToken();
    act(() => clock.advance(EXPIRY_CHECK));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await shownTokens();
    expect(screen.queryByText('Token issued')).toBeNull();
    expectNoSecret();
  });

  it('is never written by an answer that settles after another owner signed in', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(OTHER_OWNER);
    const later = deferred<IssueResult>();
    const gateway = new FakeWorkersGateway();
    gateway.issueEnrollmentToken.mockReturnValueOnce(later.promise);
    const { clock } = openTokens(gateway, session);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await screen.findByText('Issuing a token…');
    act(() => clock.advance(EXPIRY_CHECK));
    await waitFor(() => expect(screen.queryByText('Issuing a token…')).toBeNull());
    await act(async () => later.resolve({ kind: 'issued', value: issuedToken() }));
    await shownTokens();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Token issued')).toBeNull();
    expectNoSecret();
  });

  it('is never written by an answer that settles after the operator left', async () => {
    const later = deferred<IssueResult>();
    const gateway = new FakeWorkersGateway();
    gateway.issueEnrollmentToken.mockReturnValueOnce(later.promise);
    const { router } = openTokens(gateway);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await screen.findByText('Issuing a token…');
    await act(async () => {
      await router.navigate('/');
    });
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    await act(async () => later.resolve({ kind: 'issued', value: issuedToken() }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
  });
});

describe('revoking a token', () => {
  it('asks first, and Cancel keeps the token and returns the focus to the row’s button', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    openTokens(gateway);
    const user = userEvent.setup();
    const card = await cardOf('token-1');
    const revoke = card.getByRole('button', { name: 'Revoke' });
    await user.click(revoke);
    const dialog = within(await screen.findByRole('dialog', { name: 'Revoke token' }));
    expect(dialog.getByText(/Revoke token token-1\?/).textContent).toBe('Revoke token token-1? A worker can no longer enroll with it. This cannot be undone.');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(gateway.revokeEnrollmentToken).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(revoke));
  });

  it('revokes on Revoke, says so, and reads the list again', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    expect(await screen.findByText('Token revoked')).toBeDefined();
    expect(gateway.revokeEnrollmentToken).toHaveBeenCalledWith('token-1');
    expect(noticeOf('Token revoked').textContent).toContain('Token token-1 was revoked; a worker can no longer enroll with it.');
    expect(await screen.findByText('No pending token.')).toBeDefined();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(document.activeElement).toBe(noticeOf('Token revoked')));
  });

  it('names what runs while the answer is awaited', async () => {
    const later = deferred<RevokeResult>();
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    gateway.revokeEnrollmentToken.mockReturnValueOnce(later.promise);
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    expect(await screen.findByText('Revoking the token…')).toBeDefined();
    later.resolve({ kind: 'revoked' });
    await screen.findByText('Token revoked');
    expect(screen.queryByText('Revoking the token…')).toBeNull();
  });

  it('says that a redeemed token is no longer pending, naming the CLI without a command', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'token-used' });
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    const notice = noticeOf(await screen.findByText('Token already redeemed').then((title) => title.textContent ?? ''));
    expect(notice.textContent).toContain('Token token-1 was already redeemed by a worker; it is no longer pending. To stop that worker, revoke it with the CLI.');
    expect(notice.textContent).not.toMatch(/taskelith\s+\S/);
    expect(await screen.findByText('No pending token.')).toBeDefined();
  });

  it('names and links the replacement of a rotated token, still pending, when the refreshed list holds it', async () => {
    const replacement = enrollmentToken({ tokenId: 'token-2' });
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList([replacement]));
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'token-rotated', replacementTokenId: 'token-2' });
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    const region = await screen.findByText('Token already replaced').then((title) => title.closest('[role="status"]') as HTMLElement);
    const notice = within(region);
    const link = await notice.findByRole('link', { name: 'Show it' });
    expect(region.textContent).toContain('Token token-1 was replaced by token token-2. It is still pending. Show it');
    expect(link.getAttribute('href')).toBe('#enrollment-token-token-2');
    expect(link.style.color).toBe('inherit');
    expect(link.getAttribute('data-underline')).toBe('always');
    expect((await cardOf('token-2')).getByRole('heading', { level: 3 }).closest('article')?.id).toBe('enrollment-token-token-2');
  });

  it('names the replacement without a link or a pending claim when the refreshed list no longer holds it', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'token-rotated', replacementTokenId: 'token-2' });
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    const region = await screen.findByText('Token already replaced').then((title) => title.closest('[role="status"]') as HTMLElement);
    await screen.findByText('No pending token.');
    expect(within(region).queryByRole('link')).toBeNull();
    expect(region.textContent).toContain('Token token-1 was replaced by token token-2.');
    expect(region.textContent).not.toContain('pending');
  });

  it('links the replacement only once the list read after the answer holds it', async () => {
    const refreshed = deferred<ReadResult<EnrollmentTokenList>>();
    const gateway = gatewayWith(tokenList([enrollmentToken(), enrollmentToken({ tokenId: 'token-2' })]));
    gateway.listEnrollmentTokens.mockReturnValueOnce(refreshed.promise);
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'token-rotated', replacementTokenId: 'token-2' });
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    const region = await screen.findByText('Token already replaced').then((title) => title.closest('[role="status"]') as HTMLElement);
    await screen.findByText('Refreshing the tokens…');
    expect(within(region).queryByRole('link')).toBeNull();
    expect(region.textContent).not.toContain('still pending');
    await act(async () => refreshed.resolve(tokenList()));
    await screen.findByText('No pending token.');
    expect(within(region).queryByRole('link')).toBeNull();
    expect(region.textContent).not.toContain('still pending');
  });

  it('says that a token no longer exists after a 404', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'not-found' });
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    expect(noticeOf(await screen.findByText('Token not found').then(() => 'Token not found')).textContent).toContain('Token token-1 no longer exists.');
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2);
  });

  it('shows the denied state with the role after a 403, without reading the list again', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'denied', requiredRole: 'installation-owner' });
    openTokens(gateway);
    await confirm('token-1', 'Revoke');
    expect((await screen.findByText('No access to revoke tokens')).closest('[role="status"]')?.textContent).toBe(
      'No access to revoke tokensYour session holds no role that lets you revoke enrollment tokens; nothing was revoked. It needs the role installation-owner.',
    );
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
    expect((await cardOf('token-1')).getByRole('button', { name: 'Revoke' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('offers a Retry after no answer, which revokes again', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'unavailable' });
    openTokens(gateway);
    const user = await confirm('token-1', 'Revoke');
    const notice = within(await screen.findByText('Not revoked').then((title) => title.closest('[role="status"]') as HTMLElement));
    expect(notice.getByText(/token token-1 may still be pending\. Retry revokes it again\./)).toBeDefined();
    expect(notice.queryByRole('button', { name: 'Refresh the list' })).toBeNull();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
    await user.click(notice.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Token revoked')).toBeDefined();
    expect(gateway.revokeEnrollmentToken).toHaveBeenCalledTimes(2);
    expect(gateway.revokeEnrollmentToken.mock.calls).toEqual([['token-1'], ['token-1']]);
  });

  it('shows the sign-in page after a 401 unauthenticated', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'unauthenticated' });
    openTokens(gateway, session);
    await confirm('token-1', 'Revoke');
    expect(await screen.findByText('Your session expired')).toBeDefined();
  });
});

describe('rotating a token', () => {
  it('asks first with the token named', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]));
    openTokens(gateway);
    const user = userEvent.setup();
    const card = await cardOf('token-1');
    await user.click(card.getByRole('button', { name: 'Rotate' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Rotate token' }));
    expect(dialog.getByText(/Rotate token token-1\?/).textContent).toBe(
      'Rotate token token-1? The token stops working now, and a new one with the same constraints and a fresh expiry is shown once.',
    );
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(gateway.rotateEnrollmentToken).not.toHaveBeenCalled();
  });

  it('shows the new token once, titled as a rotation, and reads the list again', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList([enrollmentToken({ tokenId: 'token-1-rotated' })]));
    openTokens(gateway);
    await confirm('token-1', 'Rotate');
    const dialog = within(await screen.findByRole('dialog', { name: 'Token rotated' }));
    expect(gateway.rotateEnrollmentToken).toHaveBeenCalledWith('token-1');
    expect(dialog.getByLabelText('Enrollment token secret')).toHaveProperty('value', TOKEN_SECRET);
    expect(dialog.getByText(/stops working now/).textContent).toContain('Token token-1 stops working now.');
    await cardOf('token-1-rotated');
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(2);
  });

  it('says that a token that is not pending cannot be rotated', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.rotateEnrollmentToken.mockResolvedValueOnce({ kind: 'token-not-pending' });
    openTokens(gateway);
    await confirm('token-1', 'Rotate');
    expect((await screen.findByText('Token not pending')).closest('[role="status"]')?.textContent).toContain(
      'Token token-1 is used, expired, or revoked, so it cannot be rotated.',
    );
    expect(await screen.findByText('No pending token.')).toBeDefined();
  });

  it('says that a token may have been rotated but not shown after no answer, with a Refresh and no Retry', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList([enrollmentToken({ tokenId: 'token-1-rotated' })]));
    gateway.rotateEnrollmentToken.mockResolvedValueOnce({ kind: 'unavailable' });
    openTokens(gateway);
    const user = await confirm('token-1', 'Rotate');
    const notice = within(await screen.findByText('Not rotated, or rotated but not shown').then((title) => title.closest('[role="status"]') as HTMLElement));
    expect(notice.getByText(/^The control plane gave no usable answer\. Refresh the list: if token token-1 is still listed, it was not rotated/)).toBeDefined();
    expect(notice.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
    await user.click(notice.getByRole('button', { name: 'Refresh the list' }));
    await cardOf('token-1-rotated');
    expect(gateway.rotateEnrollmentToken).toHaveBeenCalledTimes(1);
  });

  it('says that a token no longer exists after a 404', async () => {
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.rotateEnrollmentToken.mockResolvedValueOnce({ kind: 'not-found' });
    openTokens(gateway);
    await confirm('token-1', 'Rotate');
    expect((await screen.findByText('Token not found')).closest('[role="status"]')?.textContent).toContain('Token token-1 no longer exists.');
  });
});

describe('the stale CSRF token', () => {
  function rejectedOnce(gateway: FakeWorkersGateway) {
    gateway.issueEnrollmentToken.mockResolvedValueOnce({ kind: 'csrf-rejected' });
    return gateway;
  }

  it('reads the session again once and sends the command again under the same sign-in', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = rejectedOnce(gatewayWith(tokenList(), tokenList([enrollmentToken()])));
    openTokens(gateway, session);
    await issueToken();
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledTimes(2);
    expect(session.read).toHaveBeenCalledTimes(2);
  });

  it('shows a second refusal as final, with nothing issued and no reveal', async () => {
    const gateway = rejectedOnce(rejectedOnce(new FakeWorkersGateway()));
    openTokens(gateway);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect((await screen.findByText('Not issued')).closest('[role="status"]')?.textContent).toContain('refused the session token twice, so nothing was issued');
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(gateway.listEnrollmentTokens).toHaveBeenCalledTimes(1);
  });

  it('sends nothing again when the session read gets no usable answer', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'unavailable' });
    const gateway = rejectedOnce(new FakeWorkersGateway());
    openTokens(gateway, session);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect((await screen.findByText('Not issued')).closest('[role="status"]')?.textContent).toContain('could not be asked for a new one');
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledTimes(1);
  });

  it('sends nothing again when the session read finds another owner, whose section starts afresh', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(OTHER_OWNER);
    const gateway = rejectedOnce(new FakeWorkersGateway());
    openTokens(gateway, session);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await waitFor(() => expect(session.read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Enroll a worker' })).toBeNull());
    await shownTokens();
    expect(screen.queryByText('Not issued')).toBeNull();
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledTimes(1);
  });

  it('sends nothing again when the session read finds no session, and shows the sign-in page', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    const gateway = rejectedOnce(new FakeWorkersGateway());
    openTokens(gateway, session);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect(await screen.findByText('Your session expired')).toBeDefined();
    expect(gateway.issueEnrollmentToken).toHaveBeenCalledTimes(1);
  });

  it('applies to a revoke as well', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList());
    gateway.revokeEnrollmentToken.mockResolvedValueOnce({ kind: 'csrf-rejected' });
    openTokens(gateway, session);
    await confirm('token-1', 'Revoke');
    await screen.findByText('Token revoked');
    expect(gateway.revokeEnrollmentToken.mock.calls).toEqual([['token-1'], ['token-1']]);
    expect(session.read).toHaveBeenCalledTimes(2);
  });

  it('applies to a rotation as well', async () => {
    const session = fakeGateway(AUTHENTICATED);
    const gateway = gatewayWith(tokenList([enrollmentToken()]), tokenList([enrollmentToken({ tokenId: 'token-1-rotated' })]));
    gateway.rotateEnrollmentToken.mockResolvedValueOnce({ kind: 'csrf-rejected' });
    openTokens(gateway, session);
    await confirm('token-1', 'Rotate');
    await screen.findByRole('dialog', { name: 'Token rotated' });
    expect(gateway.rotateEnrollmentToken.mock.calls).toEqual([['token-1'], ['token-1']]);
    expect(session.read).toHaveBeenCalledTimes(2);
  });
});

// Decision Q3 (a) of the brief: the secret lives in the section's state
// alone and reaches the page only while the reveal dialog is shown.
describe('redaction over the real gateways', () => {
  const TOKEN = 'c'.repeat(43);
  const SESSION = {
    state: 'authenticated',
    csrfToken: TOKEN,
    principal: { principalId: 'p-1', loginName: 'operator' },
    installationRoles: ['installation-owner'],
    expiresAt: '2026-11-04T11:00:00.000Z',
  };

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  // A control plane that issues one token and then lists it without its
  // secret; every request is recorded with its headers and body.
  function controlPlane() {
    const requests: Array<{ readonly method: string; readonly url: string; readonly headers: Headers; readonly body: string }> = [];
    let issued = false;
    const send = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ method, url, headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? init.body : '' });
      if (url === '/session') return json(200, SESSION);
      if (url === '/workers') return json(200, workersView({ workers: [] }));
      if (url === '/enrollment-tokens' && method === 'GET') return json(200, { tokens: issued ? [enrollmentToken()] : [] });
      if (url === '/enrollment-tokens' && method === 'POST') {
        issued = true;
        return json(201, issuedToken());
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    return { send, requests };
  }

  it('shows the secret once, sends the CSRF token with the command only, and leaves no secret anywhere after the close', async () => {
    const plane = controlPlane();
    const session = createSessionGateway(plane.send);
    const board = createBoardGateway({ fetch: plane.send, csrfToken: session.csrfToken });
    renderApp(WORKERS_PATH, session, new ManualClock(), board, undefined, createWorkersGateway({ fetch: plane.send, csrfToken: session.csrfToken }));
    const user = userEvent.setup();
    const writeText = stubClipboard();
    const { dialog } = await issueToken(user);
    expect(dialog.getByLabelText('Enrollment token secret')).toHaveProperty('value', TOKEN_SECRET);
    await user.click(dialog.getByRole('button', { name: 'Copy' }));
    await dialog.findByRole('button', { name: 'Copied' });
    expect(writeText.mock.calls).toEqual([[TOKEN_SECRET]]);
    await (await cardOf('token-1')).findByRole('button', { name: 'Revoke' });
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoSecret();
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);
    const post = plane.requests.find((request) => request.method === 'POST' && request.url === '/enrollment-tokens');
    expect(post?.headers.get(CSRF_HEADER)).toBe(TOKEN);
    expect(post?.body).toBe('{}');
    for (const request of plane.requests) {
      expect(request.url).not.toContain(SECRET_SHAPE);
      expect(request.body).not.toContain(SECRET_SHAPE);
      if (request.method === 'GET') expect(request.headers.get(CSRF_HEADER)).toBeNull();
    }
    const logged = consoleCalls.flat().map((arg) => (arg instanceof Error ? (arg.stack ?? arg.message) : arg));
    expect(JSON.stringify(logged)).not.toContain(TOKEN);
  });

  it('lets a secret shape planted outside the contract of the list reach nothing', async () => {
    const plane = controlPlane();
    plane.send.mockImplementationOnce(async () => json(200, SESSION));
    plane.send.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/session') return json(200, SESSION);
      if (url === '/workers') return json(200, workersView({ workers: [] }));
      if (url === '/enrollment-tokens' && (init?.method ?? 'GET') === 'GET') return json(200, { tokens: [{ ...enrollmentToken(), secret: TOKEN_SECRET }] });
      throw new Error(`Unexpected request ${url}`);
    });
    const session = createSessionGateway(plane.send);
    const board = createBoardGateway({ fetch: plane.send, csrfToken: session.csrfToken });
    renderApp(WORKERS_PATH, session, new ManualClock(), board, undefined, createWorkersGateway({ fetch: plane.send, csrfToken: session.csrfToken }));
    await cardOf('token-1');
    expectNoSecret();
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);
  });
});

// The resend over the real gateways: the header of each command request
// shows which session token it carried.
describe('the stale CSRF token over the real gateways', () => {
  const FIRST = 'a'.repeat(43);
  const RENEWED = 'b'.repeat(43);
  const CSRF_INVALID = { code: 'forbidden', message: 'Stale.', details: { reason: 'csrf-token-invalid' } };

  function session(csrfToken: string) {
    return {
      state: 'authenticated',
      csrfToken,
      principal: { principalId: 'p-1', loginName: 'operator' },
      installationRoles: ['installation-owner'],
      expiresAt: '2026-11-04T11:00:00.000Z',
    };
  }

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  interface Sent {
    readonly method: string;
    readonly url: string;
    readonly csrf: string | null;
  }

  // The first session read answers FIRST, the next ones the renewal, which
  // a test may hold; each command answers from its script in turn.
  function controlPlane(commandAnswers: Response[], renewal: Promise<Response> = Promise.resolve(json(200, session(RENEWED)))) {
    const sent: Sent[] = [];
    let sessionReads = 0;
    const send = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      sent.push({ method, url, csrf: new Headers(init?.headers).get(CSRF_HEADER) });
      if (url === '/session' && method === 'GET') {
        sessionReads += 1;
        return sessionReads === 1 ? json(200, session(FIRST)) : renewal;
      }
      if (url === '/session' && method === 'DELETE') return new Response(null, { status: 204 });
      if (url === '/workers') return json(200, workersView({ workers: [] }));
      if (url === '/enrollment-tokens' && method === 'GET') return json(200, { tokens: [enrollmentToken()] });
      const answer = method === 'GET' ? undefined : commandAnswers.shift();
      if (answer === undefined) throw new Error(`Unexpected request ${method} ${url}`);
      return answer;
    });
    const sessionGateway = createSessionGateway(send);
    const board = createBoardGateway({ fetch: send, csrfToken: sessionGateway.csrfToken });
    const workers = createWorkersGateway({ fetch: send, csrfToken: sessionGateway.csrfToken });
    const app = renderApp(WORKERS_PATH, sessionGateway, new ManualClock(), board, undefined, workers);
    const commands = () => sent.filter((request) => request.method !== 'GET');
    return { ...app, sent, commands };
  }

  it.each([
    ['an issue', 'POST /enrollment-tokens', issueToken],
    ['a rotation', 'POST /enrollment-tokens/token-1/rotation', () => confirm('token-1', 'Rotate')],
  ] as const)('sends %s once more with the renewed token after a refusal of the first', async (_, request, act) => {
    const plane = controlPlane([json(403, CSRF_INVALID), json(201, issuedToken())]);
    await act();
    await screen.findByRole('dialog');
    const commands = plane.commands();
    expect(commands.map(({ method, url }) => `${method} ${url}`)).toEqual([request, request]);
    expect(commands.map(({ csrf }) => csrf)).toEqual([FIRST, RENEWED]);
    const renewalRead = plane.sent.findIndex((sent, index) => index > plane.sent.indexOf(commands[0]!) && sent.url === '/session');
    expect(renewalRead).toBeLessThan(plane.sent.indexOf(commands[1]!));
    expect(renewalRead).toBeGreaterThan(-1);
  });

  it('shows a second refusal as final after exactly one resend with the renewed token', async () => {
    const plane = controlPlane([json(403, CSRF_INVALID), json(403, CSRF_INVALID)]);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    expect((await screen.findByText('Not issued')).closest('[role="status"]')?.textContent).toContain('refused the session token twice');
    expect(plane.commands().map(({ csrf }) => csrf)).toEqual([FIRST, RENEWED]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends nothing again when the operator leaves while the session is read again', async () => {
    const renewal = deferred<Response>();
    const plane = controlPlane([json(403, CSRF_INVALID)], renewal.promise);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await waitFor(() => expect(plane.sent.filter(({ url }) => url === '/session')).toHaveLength(2));
    await act(async () => {
      await plane.router.navigate('/');
    });
    await act(async () => renewal.resolve(json(200, session(RENEWED))));
    expect(plane.commands()).toHaveLength(1);
    expectNoSecret();
  });

  it('sends nothing again when the operator signs out while the session is read again', async () => {
    const renewal = deferred<Response>();
    const plane = controlPlane([json(403, CSRF_INVALID)], renewal.promise);
    const { user, form } = await openForm();
    await user.click(form.getByRole('button', { name: 'Issue token' }));
    await waitFor(() => expect(plane.sent.filter(({ url }) => url === '/session')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
    await act(async () => renewal.resolve(json(200, session(RENEWED))));
    expect(plane.commands().map(({ method, url }) => `${method} ${url}`)).toEqual(['POST /enrollment-tokens', 'DELETE /session']);
  });
});
