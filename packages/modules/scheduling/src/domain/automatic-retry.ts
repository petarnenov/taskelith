import type { AttemptId, AttemptOutcome, ExitStatus, Task } from '@taskelith/execution';
import { MAX_AUTOMATIC_RETRIES } from './capacity-limits.js';

// Whether an ended attempt gets an automatic retry: uncancelled, not started
// or failed with a known status after a proven start, with retries left.
export function automaticRetryOf(task: Task, attemptId: AttemptId): boolean {
  const outcome = task.attempts.find((attempt) => attempt.id === attemptId)?.outcome;
  if (outcome === undefined || outcome.cancelled) return false;
  const retries = task.attempts.filter((attempt) => attempt.retryOf !== undefined).length;
  return retries < MAX_AUTOMATIC_RETRIES && isRetryableOutcome(outcome);
}

// Not started, or exited with a known status after a proven start; anything
// else is not certain enough for an automatic retry (supervisor contract 6).
export function isCertainEnd(outcome: AttemptOutcome): boolean {
  if (outcome.kind === 'not-started') return true;
  return outcome.kind === 'exited' && outcome.startProven && classifyExit(outcome.status) !== 'unknown';
}

function isRetryableOutcome(outcome: AttemptOutcome): boolean {
  if (outcome.kind === 'not-started') return true;
  return outcome.kind === 'exited' && outcome.startProven && classifyExit(outcome.status) === 'failed';
}

type ExitVerdict = 'clean' | 'failed' | 'unknown';

// A clean exit is not acceptance, and the gates decide it (invariant 11).
function classifyExit(status: ExitStatus): ExitVerdict {
  switch (status.kind) {
    case 'code': return status.code === 0 ? 'clean' : 'failed';
    case 'signal': return 'failed';
    case 'unknown': return 'unknown';
  }
}
