import type { Result } from '@taskelith/kernel';
import { REVOCATION_PROPAGATION_SECONDS } from './source-control.js';

// How the suite waits for an ended version to be refused everywhere
// (source control contract section 3).

export const REVOCATION_POLL_MS = 1000;
const WINDOW_MS = REVOCATION_PROPAGATION_SECONDS * 1000;

// The fixture's clock in epoch milliseconds, which a test may fake.
export interface ConformanceClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export interface ObservedEnding {
  // The first refusal, or the last success when the window has passed.
  readonly result: Result<unknown>;
  // From the ending to the answer of that attempt.
  readonly latencyMs: number;
}

// Repeats an attempt that still succeeds, so that every probe starts
// within the window after the ending.
export async function awaitRefusal(
  attempt: () => Promise<Result<unknown>>,
  clock: ConformanceClock,
  endedAt: number,
): Promise<ObservedEnding> {
  for (;;) {
    const result = await attempt();
    const latencyMs = clock.now() - endedAt;
    const remainingMs = WINDOW_MS - latencyMs;
    if (!result.ok || remainingMs <= 0) return { result, latencyMs };
    await clock.sleep(Math.min(REVOCATION_POLL_MS, remainingMs));
  }
}
