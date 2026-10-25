import { PLACEMENT_BACKOFF_INITIAL_MILLISECONDS, PLACEMENT_BACKOFF_MAX_MILLISECONDS } from './capacity-limits.js';

// The base doubles from 5 s to at most 60 s, and jitter adds up to one more
// base below the cap, so a delay stays within [5 s, 60 s] (contract §5).
export function placementBackoff(retry: number, unit: number): number {
  if (!Number.isSafeInteger(retry) || retry < 1) throw new RangeError(`Retry must be a positive integer, got ${retry}`);
  if (!(unit >= 0 && unit < 1)) throw new RangeError(`Jitter draw must be in [0, 1), got ${unit}`);
  const base = Math.min(PLACEMENT_BACKOFF_MAX_MILLISECONDS, PLACEMENT_BACKOFF_INITIAL_MILLISECONDS * 2 ** Math.min(retry - 1, 16));
  const ceiling = Math.min(PLACEMENT_BACKOFF_MAX_MILLISECONDS, base * 2);
  return base + Math.floor(unit * (ceiling - base));
}
