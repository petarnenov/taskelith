// The retry backoff of launch authorization (operational targets: initial
// `5s`, maximum `60s`, with jitter; launch authorization contract sec. 8).
export const LAUNCH_RETRY_DELAY = Object.freeze({
  initialMilliseconds: 5_000,
  maximumMilliseconds: 60_000,
});

// The base doubles from 5 s to at most 60 s, and jitter adds up to one more
// base below the cap, so a delay stays within [5 s, 60 s].
export function launchRetryDelay(retry: number, draw: number): number {
  if (!Number.isSafeInteger(retry) || retry < 1) throw new RangeError(`Retry must be a positive integer, got ${retry}`);
  if (!(draw >= 0 && draw < 1)) throw new RangeError(`Jitter draw must be in [0, 1), got ${draw}`);
  const { initialMilliseconds, maximumMilliseconds } = LAUNCH_RETRY_DELAY;
  const base = Math.min(maximumMilliseconds, initialMilliseconds * 2 ** Math.min(retry - 1, 16));
  const ceiling = Math.min(maximumMilliseconds, base * 2);
  return base + Math.floor(draw * (ceiling - base));
}
