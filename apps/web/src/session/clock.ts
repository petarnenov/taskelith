export interface Clock {
  readonly now: () => number;
  readonly schedule: (delayMilliseconds: number, run: () => void) => () => void;
}

// setTimeout fires at once for a delay above 2^31 - 1 ms (about 24.8 days).
const LONGEST_TIMER_DELAY = 2 ** 31 - 1;

export const browserClock: Clock = {
  now: () => Date.now(),
  schedule: (delayMilliseconds, run) => {
    const timer = setTimeout(run, Math.min(Math.max(delayMilliseconds, 0), LONGEST_TIMER_DELAY));
    return () => clearTimeout(timer);
  },
};
