import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadResult } from '../src/api/read-result';
import { createBoardGateway } from '../src/board/control-plane-board';
import { WORKERS } from '../src/screens';
import { createSessionGateway } from '../src/session/control-plane-session';
import type { SessionRead } from '../src/session/session';
import { createWorkersGateway } from '../src/workers/control-plane-workers';
import type { SelfCheckResult, WorkersView } from '../src/workers/workers';
import { AUTHENTICATED, fakeGateway, FakeWorkersGateway, ManualClock, OPERATOR, renderApp, worker, workersView } from './fakes';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const WORKERS_PATH = '/app/workers';
const TITLE = 'Workers and account pools';
const VIEWER: SessionRead = { kind: 'authenticated', operator: { ...OPERATOR, installationRoles: [] } };

// A promise the test resolves when it chooses, so no read races it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function workersGatewayWith(...views: ReadResult<WorkersView>[]): FakeWorkersGateway {
  const gateway = new FakeWorkersGateway();
  for (const view of views) gateway.listWorkers.mockResolvedValueOnce(view);
  return gateway;
}

function read(view: WorkersView): ReadResult<WorkersView> {
  return { kind: 'read', value: view };
}

function openWorkers(gateway = new FakeWorkersGateway(), session = fakeGateway(AUTHENTICATED)) {
  return renderApp(WORKERS_PATH, session, new ManualClock(), undefined, undefined, gateway);
}

async function shownWorkers() {
  await screen.findByRole('heading', { level: 1, name: TITLE });
  return within(await screen.findByRole('region', { name: 'Workers' }));
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

// The longest run of text without a break opportunity, a space or <wbr>.
function longestUnbroken(element: Element): number {
  const text = element.innerHTML.replace(/<wbr>/g, ' ').replace(/<[^>]*>/g, ' ');
  return Math.max(...text.split(/\s+/).map((word) => word.length));
}

const FAILED_LAUNCH: SelfCheckResult = {
  checkId: 'launch-command',
  outcome: 'failed',
  details: ['the launch command exited with 1', 'no harness answered'],
};
const SANDBOX_SKIPPED: SelfCheckResult = { checkId: 'sandbox', outcome: 'not-applicable', details: ['platform-not-covered'] };
const DISK_PASSED: SelfCheckResult = { checkId: 'disk-space', outcome: 'passed', details: [] };

describe('the workers route', () => {
  it('replaces the planned page at /app/workers with the workers screen', async () => {
    openWorkers();
    expect(await screen.findByRole('heading', { level: 1, name: TITLE })).toBeDefined();
    await shownWorkers();
    expect(screen.getByRole('main').textContent).not.toContain('it shows no data');
    expect(WORKERS.change).toBe('build-workers-screen');
  });

  it('opens from the Workers entry of the navigation', async () => {
    const { workersGateway } = renderApp('/app/');
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    expect(workersGateway.listWorkers).not.toHaveBeenCalled();
    const navigation = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(navigation.getByRole('link', { name: 'Workers' }).getAttribute('href')).toBe(WORKERS_PATH);
    await userEvent.click(navigation.getByRole('link', { name: 'Workers' }));
    await shownWorkers();
    expect(workersGateway.listWorkers).toHaveBeenCalledTimes(1);
  });
});

describe('the installation-owner gate', () => {
  it('shows the heading and the role it needs, and reads nothing, without the role', async () => {
    const gateway = new FakeWorkersGateway();
    openWorkers(gateway, fakeGateway(VIEWER));
    expect(await screen.findByRole('heading', { level: 1, name: TITLE })).toBeDefined();
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Needs installation-owner');
    expect(notice.textContent).toContain('Listing the workers needs the role installation-owner');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(gateway.listWorkers).not.toHaveBeenCalled();
  });

  it('keeps the Workers entry in the navigation without the role', async () => {
    renderApp('/app/', fakeGateway(VIEWER));
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    const navigation = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(navigation.getByRole('link', { name: 'Workers' }).getAttribute('href')).toBe(WORKERS_PATH);
  });

  it('shows the denied state with the role when the control plane refuses a role the session named', async () => {
    openWorkers(workersGatewayWith({ kind: 'denied', requiredRole: 'installation-owner' }));
    expect(await screen.findByText('No access to the workers')).toBeDefined();
    expect(screen.getByText(/Reading it needs the role installation-owner\./)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('shows the denied state without a role when the control plane names none', async () => {
    openWorkers(workersGatewayWith({ kind: 'denied' }));
    expect(await screen.findByText('No access to the workers')).toBeDefined();
    expect(screen.queryByText(/needs the role/)).toBeNull();
  });
});

describe('the shown workers', () => {
  it('lists every worker in the wire order with its host, enrolment, admission, and last report', async () => {
    const view = workersView({
      workers: [
        worker({
          workerId: 'worker-b',
          host: { platform: 'darwin', architecture: 'arm64', hostname: 'mac-2.example' },
          admission: 'self-check-failed',
          results: [FAILED_LAUNCH],
        }),
        worker({ workerId: 'worker-a', host: { platform: 'linux', architecture: 'x64', hostname: 'build-1.example' } }),
      ],
    });
    openWorkers(workersGatewayWith(read(view)));
    const region = await shownWorkers();
    const cards = region.getAllByRole('article');
    expect(cards.map((card) => card.getAttribute('aria-labelledby'))).toHaveLength(2);
    expect(cards.map((card) => within(card).getByRole('heading', { level: 2 }).textContent)).toEqual(['mac-2.example', 'build-1.example']);
    const first = within(cards[0]!);
    expect(cards[0]!.textContent).toContain('Worker worker-b');
    expect(first.getByText(/macOS arm64, enrolled/).textContent).toContain(new Date(view.workers[0]!.enrolledAt).toLocaleString());
    expect(first.getByText('Not admitted: self-check failed')).toBeDefined();
    expect(first.getByText(/Last report/).textContent).toContain(new Date(view.workers[0]!.reportedAt!).toLocaleString());
    const second = within(cards[1]!);
    expect(second.getByText(/Linux x64, enrolled/)).toBeDefined();
    expect(second.getByText('Admitted')).toBeDefined();
    expect(screen.getByText(/As of/).textContent).toContain(new Date(view.asOf).toLocaleString());
    expect(screen.getByText(/As of/).querySelector('time')?.getAttribute('datetime')).toBe(view.asOf);
  });

  it('shows every check in words, the failed ones first with their problems, and a reason for a skipped one', async () => {
    const view = workersView({
      workers: [worker({ admission: 'self-check-failed', results: [DISK_PASSED, FAILED_LAUNCH, SANDBOX_SKIPPED] })],
    });
    openWorkers(workersGatewayWith(read(view)));
    const region = await shownWorkers();
    const checks = within(region.getByRole('list', { name: 'Self-checks' }));
    const items = checks.getAllByRole('listitem').filter((item) => item.parentElement?.getAttribute('aria-label') === 'Self-checks');
    const wording = (item: HTMLElement) => [...item.querySelector('p')!.childNodes].filter((node) => node.nodeName !== 'UL');
    expect(items.map((item) => wording(item).map((node) => node.textContent).join(''))).toEqual([
      'launch-command failed',
      'disk-space passed',
      'sandbox not applicable: platform not covered',
    ]);
    const problems = within(items[0]!).getAllByRole('listitem');
    expect(problems.map((problem) => problem.textContent)).toEqual(['the launch command exited with 1', 'no harness answered']);
    expect(document.querySelector('.mantine-Badge-root')).toBeNull();
  });

  it('says that a worker awaiting its self-check has no report yet', async () => {
    const view = workersView({ workers: [worker({ admission: 'awaiting-self-check', reportedAt: undefined, results: [] })] });
    openWorkers(workersGatewayWith(read(view)));
    const region = await shownWorkers();
    expect(region.getByText('Awaiting self-check')).toBeDefined();
    expect(region.getByText('No report yet.')).toBeDefined();
    expect(region.queryByRole('list', { name: 'Self-checks' })).toBeNull();
    expect(region.queryByText(/Last report/)).toBeNull();
  });

  it('says that no worker is enrolled for an empty view, without a link', async () => {
    openWorkers(workersGatewayWith(read(workersView({ workers: [] }))));
    await screen.findByRole('heading', { level: 1, name: TITLE });
    expect(await screen.findByText('No worker is enrolled. Enroll one with an enrollment token.')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Workers' })).toBeNull();
    expect(screen.getByText(/As of/)).toBeDefined();
    expect(within(screen.getByRole('main')).queryAllByRole('link')).toEqual([]);
  });

  it('breaks a long hostname and a long worker identifier at phone width', async () => {
    const hostname = 'h'.repeat(64);
    const view = workersView({ workers: [worker({ workerId: 'w'.repeat(128), host: { platform: 'linux', architecture: 'x64', hostname } })] });
    openWorkers(workersGatewayWith(read(view)));
    const region = await shownWorkers();
    const card = region.getByRole('article');
    expect(card.textContent).toContain(hostname);
    expect(longestUnbroken(card)).toBeLessThanOrEqual(16);
  });
});

describe('Refresh', () => {
  it('reads the workers again and keeps the shown list until the new one arrives', async () => {
    const later = deferred<ReadResult<WorkersView>>();
    const gateway = workersGatewayWith(read(workersView()));
    gateway.listWorkers.mockReturnValueOnce(later.promise);
    openWorkers(gateway);
    const region = await shownWorkers();
    expect(region.getByRole('heading', { level: 2, name: 'build-1.example' })).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(gateway.listWorkers).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Refreshing the workers…')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'build-1.example' })).toBeDefined();
    const renewed = workersView({ asOf: '2026-11-03T10:00:00.000Z', workers: [worker({ host: { platform: 'linux', architecture: 'x64', hostname: 'build-2.example' } })] });
    later.resolve(read(renewed));
    expect(await screen.findByRole('heading', { level: 2, name: 'build-2.example' })).toBeDefined();
    expect(screen.queryByRole('heading', { level: 2, name: 'build-1.example' })).toBeNull();
    expect(screen.queryByText('Refreshing the workers…')).toBeNull();
    expect(screen.getByText(/As of/).textContent).toContain(new Date(renewed.asOf).toLocaleString());
  });

  it('replaces the list with the failure when the refresh fails, and Retry reads again', async () => {
    const gateway = workersGatewayWith(read(workersView()), { kind: 'unavailable' }, read(workersView()));
    openWorkers(gateway);
    await shownWorkers();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('The workers cannot be loaded')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Workers' })).toBeNull();
    expect(screen.queryByText(/As of/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await shownWorkers();
    expect(gateway.listWorkers).toHaveBeenCalledTimes(3);
  });

  it('drops the answer of a read that a later refresh overtook', async () => {
    const first = deferred<ReadResult<WorkersView>>();
    const gateway = workersGatewayWith(read(workersView()));
    gateway.listWorkers.mockReturnValueOnce(first.promise);
    const stale = workersView({ workers: [worker({ host: { platform: 'linux', architecture: 'x64', hostname: 'stale.example' } })] });
    const fresh = workersView({ workers: [worker({ host: { platform: 'linux', architecture: 'x64', hostname: 'fresh.example' } })] });
    gateway.listWorkers.mockResolvedValueOnce(read(fresh));
    openWorkers(gateway);
    await shownWorkers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'fresh.example' })).toBeDefined();
    first.resolve(read(stale));
    await new Promise((settle) => setTimeout(settle, 0));
    expect(screen.queryByRole('heading', { level: 2, name: 'stale.example' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'fresh.example' })).toBeDefined();
  });
});

describe('a failed read', () => {
  it('of an unreachable control plane shows why, and Retry reads again', async () => {
    const gateway = workersGatewayWith({ kind: 'unavailable' }, read(workersView()));
    openWorkers(gateway);
    expect(await screen.findByText('The workers cannot be loaded')).toBeDefined();
    expect(screen.getByText(/no worker is shown rather than a list that may be wrong/)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await shownWorkers();
    expect(gateway.listWorkers).toHaveBeenCalledTimes(2);
  });

  it('of a gateway that throws reads as an unreachable control plane', async () => {
    const gateway = new FakeWorkersGateway();
    gateway.listWorkers.mockRejectedValueOnce(new Error('boom'));
    openWorkers(gateway);
    expect(await screen.findByText('The workers cannot be loaded')).toBeDefined();
  });

  it('answered as not found shows that the control plane knows no workers view', async () => {
    openWorkers(workersGatewayWith({ kind: 'not-found' }));
    expect(await screen.findByText('The control plane knows no workers view at this address.')).toBeDefined();
  });

  it('answered 401 unauthenticated shows the sign-in page with the expired notice and reads a fresh session', async () => {
    const session = fakeGateway(AUTHENTICATED);
    session.read.mockResolvedValueOnce(AUTHENTICATED).mockResolvedValueOnce({ kind: 'anonymous' });
    openWorkers(workersGatewayWith({ kind: 'unauthenticated' }), session);
    expect(await screen.findByText('Your session expired')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Sign in to Taskelith' })).toBeDefined();
    await waitFor(() => expect(session.read).toHaveBeenCalledTimes(2));
  });
});

describe('loading', () => {
  it('names what loads and shows no loader under reduced motion', async () => {
    await withReducedMotion(async () => {
      const first = deferred<ReadResult<WorkersView>>();
      const second = deferred<ReadResult<WorkersView>>();
      const gateway = new FakeWorkersGateway();
      gateway.listWorkers.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      openWorkers(gateway);
      expect(await screen.findByText('Loading the workers…')).toBeDefined();
      expect(spinnerOf('Loading the workers…')).toBeNull();
      first.resolve(read(workersView()));
      await shownWorkers();
      await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(await screen.findByText('Refreshing the workers…')).toBeDefined();
      expect(spinnerOf('Refreshing the workers…')).toBeNull();
    });
  });

  it('shows a loader otherwise', async () => {
    const later = deferred<ReadResult<WorkersView>>();
    const gateway = new FakeWorkersGateway();
    gateway.listWorkers.mockReturnValueOnce(later.promise);
    openWorkers(gateway);
    expect(await screen.findByText('Loading the workers…')).toBeDefined();
    expect(spinnerOf('Loading the workers…')).not.toBeNull();
  });

  it('keeps every control focusable and named', async () => {
    openWorkers();
    await shownWorkers();
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      expect(control.getAttribute('aria-label') ?? control.textContent).not.toBe('');
    }
  });
});

// Decision Q9: the server re-redacts every detail; the page still shows
// the body as received, keeps it in component state only, and writes
// nothing to a storage or the console.
describe('redaction', () => {
  const TOKEN = 'c'.repeat(43);
  const SECRET = `tken_${'f'.repeat(43)}`;
  const SESSION = {
    state: 'authenticated',
    csrfToken: TOKEN,
    principal: { principalId: 'p-1', loginName: 'operator' },
    installationRoles: ['installation-owner'],
    expiresAt: '2026-11-04T11:00:00.000Z',
  };

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  // A control plane whose workers view carries the redacted texts, and a
  // field outside the contract that holds a raw secret shape.
  function controlPlane() {
    const entry = {
      ...worker({
        host: { platform: 'linux', architecture: 'x64', hostname: 'build-[redacted].example' },
        admission: 'self-check-failed',
        results: [{ checkId: 'launch-command', outcome: 'failed', details: ['launch refused for [redacted]'] }],
      }),
      credential: SECRET,
    };
    const send = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/session') return json(200, SESSION);
      if (url === '/workers') return json(200, { asOf: '2026-11-03T09:10:00.000Z', workers: [entry] });
      throw new Error(`Unexpected request ${url}`);
    });
    return send;
  }

  it('shows the redacted texts as received and lets no secret shape reach the page, a storage, or the console', async () => {
    const send = controlPlane();
    const session = createSessionGateway(send);
    const board = createBoardGateway({ fetch: send, csrfToken: session.csrfToken });
    const consoleCalls: unknown[][] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
        consoleCalls.push(args);
      }),
    );
    try {
      renderApp(WORKERS_PATH, session, new ManualClock(), board, undefined, createWorkersGateway({ fetch: send }));
      const region = await shownWorkers();
      expect(region.getByRole('heading', { level: 2, name: 'build-[redacted].example' })).toBeDefined();
      expect(region.getByText('launch refused for [redacted]')).toBeDefined();
      const page = document.documentElement.outerHTML;
      expect(page).not.toContain(SECRET);
      expect(page).not.toContain('tken_');
      expect(page).not.toContain(TOKEN);
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.length).toBe(0);
      const logged = consoleCalls.flat().map((arg) => (arg instanceof Error ? (arg.stack ?? arg.message) : arg));
      expect(JSON.stringify(logged)).not.toContain('tken_');
      expect(JSON.stringify(logged)).not.toContain(TOKEN);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
