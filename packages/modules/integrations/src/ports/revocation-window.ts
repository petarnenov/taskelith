import type { Failure, Result } from '@taskelith/kernel';
import { REVOCATION_PROPAGATION_SECONDS } from './source-control.js';

// How the suite waits for an ended version to be refused everywhere
// (source control contract section 3).

export const REVOCATION_POLL_MS = 1000;
const WINDOW_MS = REVOCATION_PROPAGATION_SECONDS * 1000;
const TIMED_OUT: unique symbol = Symbol('timed out');

// The fixture's clock in epoch milliseconds, which a test may fake.
export interface ConformanceClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
  // Resolves after the time unless the signal aborts first.
  timeout(milliseconds: number, signal: AbortSignal): Promise<void>;
}

export interface ObservedEnding {
  // The refusal answered within the window, or undefined when none was.
  readonly refusal: Failure | undefined;
  // From the ending to the last answer, or to the window's end.
  readonly latencyMs: number;
}

type Attempt = () => Promise<Result<unknown>>;

export function awaitRefusal(attempt: Attempt, clock: ConformanceClock, endedAt: number): Promise<ObservedEnding> {
  return awaitRefusals([attempt], clock, endedAt).then(([ending]) => ending!);
}

// Each round repeats the attempts not yet refused, then sleeps. Every
// attempt starts and answers within the window after the shared ending.
export async function awaitRefusals(
  attempts: readonly Attempt[],
  clock: ConformanceClock,
  endedAt: number,
): Promise<ObservedEnding[]> {
  const endings: (ObservedEnding | undefined)[] = attempts.map(() => undefined);
  for (;;) {
    for (const [index, attempt] of attempts.entries()) {
      if (endings[index] === undefined) endings[index] = await observe(attempt, clock, endedAt);
    }
    const latencyMs = clock.now() - endedAt;
    if (endings.every((ending) => ending !== undefined)) return endings as ObservedEnding[];
    await clock.sleep(Math.min(REVOCATION_POLL_MS, Math.max(0, WINDOW_MS - latencyMs)));
  }
}

// The final ending of one attempt, or undefined while it still succeeds
// within the window.
async function observe(attempt: Attempt, clock: ConformanceClock, endedAt: number): Promise<ObservedEnding | undefined> {
  const remainingMs = WINDOW_MS - (clock.now() - endedAt);
  if (remainingMs <= 0) return { refusal: undefined, latencyMs: clock.now() - endedAt };
  const result = await within(attempt(), clock, remainingMs);
  const latencyMs = clock.now() - endedAt;
  if (result === TIMED_OUT || latencyMs > WINDOW_MS) return { refusal: undefined, latencyMs };
  return result.ok ? undefined : { refusal: result.error, latencyMs };
}

async function within<Value>(
  pending: Promise<Value>,
  clock: ConformanceClock,
  milliseconds: number,
): Promise<Value | typeof TIMED_OUT> {
  const stop = new AbortController();
  try {
    return await Promise.race([pending, clock.timeout(milliseconds, stop.signal).then((): typeof TIMED_OUT => TIMED_OUT)]);
  } finally {
    stop.abort();
  }
}
