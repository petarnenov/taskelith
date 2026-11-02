import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../src/App';
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

export function renderApp(path: string, gateway: SessionGateway = fakeGateway(AUTHENTICATED), clock = new ManualClock()) {
  const router = createMemoryRouter(appRoutes(), { basename: APP_BASENAME, initialEntries: [path] });
  const view = render(<App router={router} gateway={gateway} clock={clock} />);
  return { ...view, router, gateway, clock };
}
