import { isSpaceRefusal, launchRetryDelay, type ExecutionId } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';

// What the retry of a write refused for lack of space needs.
export interface SpaceRetry {
  // Resolves after the delay, or early once the signal aborts.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  // A jitter draw in [0, 1).
  readonly draw: () => number;
  readonly logger: Logger;
  // Told of a failure other than a refusal for space.
  readonly onFailure?: (error: unknown) => void;
}

// Waits within [5 s, 60 s], the backoff of the operational targets, after
// the given number of consecutive refusals.
export async function backOffForSpace(
  retry: SpaceRetry,
  executionId: ExecutionId,
  refusals: number,
  signal: AbortSignal,
): Promise<void> {
  const delayMilliseconds = launchRetryDelay(refusals, retry.draw());
  retry.logger.warn('worker.journal.space-refused', { executionId, refusals, delayMilliseconds });
  await retry.sleep(delayMilliseconds, signal);
}

// Commits a journal write; one refused for space rolled back and is tried
// again, unchanged, after the backoff until it commits or the signal aborts.
export async function commitWrite(
  retry: SpaceRetry,
  executionId: ExecutionId,
  write: () => Result<void>,
  signal: AbortSignal,
): Promise<boolean> {
  for (let refusals = 1; ; refusals += 1) {
    const written = write();
    if (written.ok) return true;
    if (!isSpaceRefusal(written.error)) {
      retry.onFailure?.(written.error);
      return false;
    }
    if (signal.aborted) return false;
    await backOffForSpace(retry, executionId, refusals, signal);
    if (signal.aborted) return false;
  }
}

// Writes that every pass derives again: one refused for space is held back
// until its backoff has passed, so the pass goes on meanwhile.
export class HeldWrites {
  readonly #retry: SpaceRetry;
  // Milliseconds on a monotonic clock, or undefined when it cannot be read.
  readonly #now: () => number | undefined;
  readonly #held = new Map<string, { readonly refusals: number; readonly dueAt: number }>();

  constructor(retry: SpaceRetry, now: () => number | undefined) {
    this.#retry = retry;
    this.#now = now;
  }

  // An unreadable clock lets the write be tried again.
  due(key: string): boolean {
    const held = this.#held.get(key);
    const now = this.#now();
    return held === undefined || now === undefined || now >= held.dueAt;
  }

  // Answers whether the write committed; other failures are reported.
  commit(key: string, write: () => Result<void>): boolean {
    const written = write();
    if (written.ok) {
      this.#held.delete(key);
      return true;
    }
    if (!isSpaceRefusal(written.error)) {
      this.#retry.onFailure?.(written.error);
      return false;
    }
    const refusals = (this.#held.get(key)?.refusals ?? 0) + 1;
    const delayMilliseconds = launchRetryDelay(refusals, this.#retry.draw());
    this.#retry.logger.warn('worker.journal.space-refused', { write: key, refusals, delayMilliseconds });
    this.#held.set(key, { refusals, dueAt: (this.#now() ?? 0) + delayMilliseconds });
    return false;
  }
}
