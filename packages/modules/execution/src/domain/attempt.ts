import type { Instant } from '@taskelith/kernel';
import type { EvidenceReference, OwnershipGeneration } from '@taskelith/sdlc';
import { isTerminalExecution, type Execution, type ExitStatus } from './execution.js';
import type { AttemptId, ExecutionId } from './identifiers.js';

// An attempt's phase is derived from its executions and outcome, never stored
// apart from them (invariant 6). Placement is the scheduler's assignment.
export const ATTEMPT_PHASES = Object.freeze(['awaiting-launch', 'launch-authorized', 'running', 'ended'] as const);

export type AttemptPhase = (typeof ATTEMPT_PHASES)[number];

// The phase changes the execution transitions can cause. An attempt whose
// execution ended without an outcome awaits a new launch or its end.
export const ATTEMPT_PHASE_TRANSITIONS: Readonly<Record<AttemptPhase, readonly AttemptPhase[]>> = Object.freeze({
  'awaiting-launch': Object.freeze(['launch-authorized', 'ended'] as const),
  'launch-authorized': Object.freeze(['awaiting-launch', 'running', 'ended'] as const),
  running: Object.freeze(['awaiting-launch', 'ended'] as const),
  ended: Object.freeze([] as const),
});

// Why cancellation was requested: on request, because a compared value
// changed after a grant, or because the attempt's assignment ended.
export const CANCELLATION_REASONS = Object.freeze(['requested', 'launch-revoked', 'assignment-ended'] as const);

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

// A request is never proof of termination; the attempt ends as cancelled
// only once no execution of it can run.
export interface CancellationRequest {
  readonly reason: CancellationReason;
  readonly requestedAt: Instant;
}

// What an ended attempt reports to its task, at the ownership generation it
// ended in. A clean exit is not completion: gates decide (invariant 11).
export type AttemptOutcome = OutcomeValues & (
  | { readonly kind: 'exited'; readonly executionId: ExecutionId; readonly status: ExitStatus; readonly startProven: boolean }
  | { readonly kind: 'operator-resolved'; readonly executionId: ExecutionId; readonly evidence: EvidenceReference }
  | { readonly kind: 'not-started' }
);

export interface OutcomeValues {
  readonly cancelled: boolean;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly endedAt: Instant;
}

export interface Attempt {
  readonly id: AttemptId;
  readonly retryOf?: AttemptId;
  readonly executions: readonly Execution[];
  readonly cancellation?: CancellationRequest;
  readonly outcome?: AttemptOutcome;
}

export function attemptPhase(attempt: Attempt): AttemptPhase {
  if (attempt.outcome !== undefined) return 'ended';
  const owning = owningExecution(attempt);
  if (owning?.state === 'started') return 'running';
  if (owning?.state === 'authorized') return 'launch-authorized';
  return 'awaiting-launch';
}

// The one execution that is not terminal, if any (launch authorization
// contract, section 4).
export function owningExecution(attempt: Attempt): Execution | undefined {
  return attempt.executions.find((execution) => !isTerminalExecution(execution));
}

// The outcome once no execution can run: the last exit decides it, and an
// attempt without one never started a process.
export function outcomeOf(attempt: Attempt, ownershipGeneration: OwnershipGeneration, endedAt: Instant): AttemptOutcome {
  const values = { cancelled: attempt.cancellation !== undefined, ownershipGeneration, endedAt };
  const exited = [...attempt.executions].reverse().find((execution) => execution.exit !== undefined);
  if (exited?.exit === undefined) return Object.freeze({ ...values, kind: 'not-started' });
  const { exit } = exited;
  if (exit.operatorEvidence !== undefined) {
    return Object.freeze({ ...values, kind: 'operator-resolved', executionId: exited.id, evidence: exit.operatorEvidence });
  }
  return Object.freeze({ ...values, kind: 'exited', executionId: exited.id, status: exit.status, startProven: exit.startProven });
}
