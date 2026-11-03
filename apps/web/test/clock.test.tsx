import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserClock } from '../src/session/clock';
import { useSession } from '../src/session/SessionProvider';

describe('browserClock', () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  it('reads the time and runs a callback once its delay has passed', () => {
    const run = vi.fn();
    browserClock.schedule(1_000, run);
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(browserClock.now()).toBe(1_000);
  });

  it('runs nothing once cancelled', () => {
    const run = vi.fn();
    browserClock.schedule(1_000, run)();
    vi.advanceTimersByTime(1_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps a delay beyond the timer limit from firing at once', () => {
    const run = vi.fn();
    browserClock.schedule(2 ** 40, run);
    vi.advanceTimersByTime(1_000);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('useSession', () => {
  it('refuses to run outside a SessionProvider', () => {
    function Orphan() {
      useSession();
      return null;
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow('useSession needs a SessionProvider.');
    vi.restoreAllMocks();
  });
});
