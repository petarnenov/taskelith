import type { AttemptId, AttemptOutcome, ExitStatus, Task } from '@taskelith/execution';
import { MAX_AUTOMATIC_RETRIES } from './capacity-limits.js';

// Whether an ended attempt gets an automatic retry: uncancelled, not started
// or failed after a proven start, while the task has retries left.
export function automaticRetryOf(task: Task, attemptId: AttemptId): boolean {
  const outcome = task.attempts.find((attempt) => attempt.id === attemptId)?.outcome;
  if (outcome === undefined || outcome.cancelled) return false;
  const retries = task.attempts.filter((attempt) => attempt.retryOf !== undefined).length;
  return retries < MAX_AUTOMATIC_RETRIES && isRetryableOutcome(outcome);
}

// A clean exit is not acceptance, and the gates decide it (invariant 11).
function isRetryableOutcome(outcome: AttemptOutcome): boolean {
  if (outcome.kind === 'not-started') return true;
  return outcome.kind === 'exited' && outcome.startProven && !isCleanExit(outcome.status);
}

function isCleanExit(status: ExitStatus): boolean {
  return status.kind === 'code' && status.code === 0;
}
