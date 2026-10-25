import { setTimeout as delay } from 'node:timers/promises';

export const SAMPLE_INTERVAL_MILLISECONDS = 15_000;

// Runs the sample at once and then after every interval until the signal
// aborts; a sample that throws is a defect and ends the loop.
export async function runPeriodically(
  sample: () => Promise<void> | void,
  signal: AbortSignal,
  intervalMilliseconds = SAMPLE_INTERVAL_MILLISECONDS,
): Promise<void> {
  while (!signal.aborted) {
    await sample();
    await delay(intervalMilliseconds, undefined, { signal }).catch(ignoreAbort);
  }
}

function ignoreAbort(error: unknown): void {
  if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
}
