import { isSpaceRefusal, launchRetryDelay, type ExecutionId } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';

// What the retry of a fact refused for lack of space needs.
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

// Commits a fact the record keeps; a refusal for space rolled back and is
// retried after the backoff until it commits or the signal aborts.
export async function commitFact(
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
