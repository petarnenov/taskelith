import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLOR_SCHEME_KEY } from '../src/App';
import { EXPIRY_MARGIN_MILLISECONDS } from '../src/session/SessionProvider';
import type { LoginOutcome, SessionRead } from '../src/session/session';
import { ANONYMOUS, AUTHENTICATED, fakeGateway, HOUR, ManualClock, NOW, OPERATOR, renderApp } from './fakes';

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.resetModules();
});

// A promise the test resolves when it chooses, so no state change races it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function signIn(loginName = 'operator', password = 'fixture-password') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/Login name/), loginName);
  await user.type(screen.getByLabelText(/Password/), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

async function openAccountMenu() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Account menu' }));
  return user;
}

describe('the session check', () => {
  it('shows nothing of the product until the control plane names a session', async () => {
    const read = deferred<SessionRead>();
    const gateway = fakeGateway();
    gateway.read.mockReturnValueOnce(read.promise);
    renderApp('/app/', gateway);
    expect(screen.getByText('Checking your session…')).toBeDefined();
    expect(screen.queryByRole('navigation')).toBeNull();
    await act(async () => read.resolve(ANONYMOUS));
    expect(screen.getByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
  });

  it('offers a retry while the control plane cannot be reached', async () => {
    const gateway = fakeGateway();
    gateway.read.mockResolvedValueOnce({ kind: 'unavailable' });
    renderApp('/app/', gateway);
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
    expect(gateway.read).toHaveBeenCalledTimes(2);
  });
});

describe('the sign-in page', () => {
  it('asks for the login name and password without a navigation', async () => {
    renderApp('/app/', fakeGateway(ANONYMOUS));
    const hint = await screen.findByText('Sign in with your login name and password.');
    expect(within(screen.getByRole('main')).getByRole('form', { name: 'Sign in' })).toBeDefined();
    expect(hint).toBeDefined();
    expect(document.querySelector('.mantine-InputWrapper-required')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull();
  });
});

describe('login', () => {
  it('logs in and shows the page of the address it was opened at', async () => {
    const gateway = fakeGateway();
    renderApp('/app/workers', gateway);
    await signIn();
    expect(gateway.logIn).toHaveBeenCalledWith({ loginName: 'operator', password: 'fixture-password' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Workers and account pools' })).toBeDefined();
  });

  it.each<[string, LoginOutcome, string]>([
    ['wrong credentials', { kind: 'rejected', reason: 'wrong-credentials' }, 'The login name or the password is wrong.'],
    ['an invalid request', { kind: 'rejected', reason: 'invalid-request' }, 'Enter a login name of lowercase letters'],
    ['an expired form', { kind: 'rejected', reason: 'form-expired' }, 'The sign-in form expired. Sign in again.'],
    ['an unreachable control plane', { kind: 'unavailable' }, 'The control plane cannot be reached. Try again.'],
  ])('explains %s and clears the password', async (_, outcome, text) => {
    const gateway = fakeGateway();
    gateway.logIn.mockResolvedValueOnce(outcome);
    renderApp('/app/', gateway);
    await signIn();
    expect((await screen.findByRole('alert')).textContent).toContain(text);
    expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined();
  });

  it('reads a fresh anonymous session after an expired form', async () => {
    const gateway = fakeGateway();
    gateway.logIn.mockResolvedValueOnce({ kind: 'rejected', reason: 'form-expired' });
    renderApp('/app/', gateway);
    await signIn();
    await screen.findByRole('alert');
    expect(gateway.read).toHaveBeenCalledTimes(2);
  });

  it('takes over a session that another tab logged in meanwhile', async () => {
    const gateway = fakeGateway();
    gateway.logIn.mockResolvedValueOnce({ kind: 'rejected', reason: 'form-expired' });
    gateway.read.mockResolvedValueOnce(ANONYMOUS).mockResolvedValueOnce(AUTHENTICATED);
    renderApp('/app/', gateway);
    await signIn();
    expect(await screen.findByRole('heading', { level: 1, name: 'Project board' })).toBeDefined();
  });
});

describe('the account menu and logout', () => {
  it('names the operator and the installation-wide roles', async () => {
    renderApp('/app/');
    await openAccountMenu();
    const menu = await screen.findByRole('menu');
    expect(menu.textContent).toContain('Signed in as operator');
    expect(menu.textContent).toContain('installation-owner (installation-wide)');
    expect(screen.getByRole('button', { name: 'Account menu' }).textContent).toBe('OP');
  });

  it('says when the operator has no installation-wide role', async () => {
    const gateway = fakeGateway({ kind: 'authenticated', operator: { ...OPERATOR, installationRoles: [] } });
    renderApp('/app/', gateway);
    await openAccountMenu();
    expect((await screen.findByRole('menu')).textContent).toContain('No installation-wide role');
  });

  it('signs out and says that only the browser session ended', async () => {
    const gateway = fakeGateway(AUTHENTICATED);
    gateway.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(ANONYMOUS);
    renderApp('/app/', gateway);
    const user = await openAccountMenu();
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('You signed out')).toBeDefined();
    expect(screen.getByText(/only this browser session ended/)).toBeDefined();
    expect(gateway.logOut).toHaveBeenCalledTimes(1);
  });

  it('stays signed in and says so when the logout fails', async () => {
    const gateway = fakeGateway(AUTHENTICATED);
    gateway.logOut.mockResolvedValueOnce({ kind: 'failed' });
    renderApp('/app/', gateway);
    const user = await openAccountMenu();
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect((await screen.findByRole('alert')).textContent).toContain('did not end the session');
    expect(screen.getByRole('heading', { level: 1, name: 'Project board' })).toBeDefined();
  });
});

describe('session expiry', () => {
  it('reads the session again just after its end and shows that it expired', async () => {
    const clock = new ManualClock();
    const gateway = fakeGateway(AUTHENTICATED);
    gateway.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(ANONYMOUS);
    renderApp('/app/reviews', gateway, clock);
    await screen.findByRole('heading', { level: 1, name: 'Reviews' });
    expect(clock.pendingDelays()).toEqual([HOUR + EXPIRY_MARGIN_MILLISECONDS]);
    act(() => clock.advance(HOUR + EXPIRY_MARGIN_MILLISECONDS - 1));
    expect(gateway.read).toHaveBeenCalledTimes(1);
    act(() => clock.advance(1));
    expect(await screen.findByText('Your session expired')).toBeDefined();
    expect(gateway.read).toHaveBeenCalledTimes(2);
  });

  it('keeps a session that was renewed meanwhile and waits for its new end', async () => {
    const clock = new ManualClock();
    const renewed: SessionRead = { kind: 'authenticated', operator: { ...OPERATOR, expiresAt: NOW + 3 * HOUR } };
    const gateway = fakeGateway(AUTHENTICATED);
    gateway.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(renewed);
    renderApp('/app/', gateway, clock);
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    act(() => clock.advance(HOUR + EXPIRY_MARGIN_MILLISECONDS));
    await waitFor(() => expect(clock.pendingDelays()).toEqual([2 * HOUR]));
    expect(screen.getByRole('heading', { level: 1, name: 'Project board' })).toBeDefined();
  });

  it('waits at least the margin when the session already looks ended', async () => {
    const clock = new ManualClock();
    const gateway = fakeGateway({ kind: 'authenticated', operator: { ...OPERATOR, expiresAt: NOW - HOUR } });
    renderApp('/app/', gateway, clock);
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    expect(clock.pendingDelays()).toEqual([EXPIRY_MARGIN_MILLISECONDS]);
  });

  it('stops waiting for the end once the operator signed out', async () => {
    const clock = new ManualClock();
    const gateway = fakeGateway(AUTHENTICATED);
    gateway.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce(ANONYMOUS);
    renderApp('/app/', gateway, clock);
    const user = await openAccountMenu();
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await screen.findByText('You signed out');
    expect(clock.pendingDelays()).toEqual([]);
  });
});

describe('the color scheme', () => {
  it('starts dark and keeps the chosen scheme for the next visit', async () => {
    const first = renderApp('/app/');
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to the light theme' }));
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('light');
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('light');
    first.unmount();
    renderApp('/app/');
    expect(await screen.findByRole('button', { name: 'Switch to the dark theme' })).toBeDefined();
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('light');
  });
});

describe('main', () => {
  function stubSessionFetch() {
    const body = JSON.stringify({ state: 'anonymous', csrfToken: 'c'.repeat(43) });
    const send = vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', send);
    return send;
  }

  it('renders the shell into #root and reads the session from the control plane', async () => {
    const send = stubSessionFetch();
    window.history.replaceState(null, '', '/app/');
    document.body.innerHTML = '<div id="root"></div>';
    await import('../src/main');
    expect(await screen.findByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
    expect(send).toHaveBeenCalledWith('/session', expect.objectContaining({ method: 'GET' }));
  });

  it('fails clearly without a #root element', async () => {
    await expect(import('../src/main')).rejects.toThrow('The page has no #root element.');
  });
});
