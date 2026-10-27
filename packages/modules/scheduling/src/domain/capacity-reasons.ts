// Contract section 11: waiting leaves the task queued, rejecting ends its
// admission to capacity, and standing changes nothing.
export const WAITING_REASONS = Object.freeze([
  'quarantined',
  'worker-not-eligible',
  'worker-capacity-exhausted',
  'project-quota-exhausted',
  'run-quota-exhausted',
  'provider-concurrency-exhausted',
  'control-not-enforceable',
  'delegation-awaiting-capacity',
] as const);

export const STANDING_REASONS = Object.freeze(['attempt-already-reserved', 'attempt-not-reservable'] as const);

export const REJECTING_REASONS = Object.freeze([
  'resource-ceiling-exceeded',
  'spend-limit-not-enforceable',
  'delegation-depth-exceeded',
  'delegation-chain-exceeds-quota',
  'delegation-budget-exhausted',
  'retry-budget-exhausted',
] as const);

// Reasons about one worker: placement tries the next candidate on them.
export const WORKER_REASONS = Object.freeze(['worker-not-eligible', 'worker-capacity-exhausted', 'control-not-enforceable'] as const);

// A placement that found no candidate worker reports this reason.
export const NO_CANDIDATE_REASON = 'no-candidate';

// Reasons no task's own limit explains, the fleet having no room: such a
// decline stops the rotation cursor and backs off no task (contract §5, §13).
export const FLEET_REASONS = Object.freeze([
  'quarantined', 'worker-not-eligible', 'worker-capacity-exhausted', NO_CANDIDATE_REASON,
] as const);

export type WaitingReason = (typeof WAITING_REASONS)[number];
export type RejectingReason = (typeof REJECTING_REASONS)[number];
export type StandingReason = (typeof STANDING_REASONS)[number];
export type CapacityReason = WaitingReason | RejectingReason | StandingReason;

export type ReasonOutcome = 'waiting' | 'rejected' | 'standing';

export function isWaitingReason(reason: CapacityReason): reason is WaitingReason {
  return (WAITING_REASONS as readonly string[]).includes(reason);
}

export function reasonOutcome(reason: CapacityReason): ReasonOutcome {
  if (isWaitingReason(reason)) return 'waiting';
  return (STANDING_REASONS as readonly string[]).includes(reason) ? 'standing' : 'rejected';
}

export function triesNextCandidate(reason: CapacityReason): boolean {
  return (WORKER_REASONS as readonly string[]).includes(reason);
}

// Takes any value, since failure details carry the reason untyped.
export function lacksFleetCapacity(reason: unknown): boolean {
  return (FLEET_REASONS as readonly unknown[]).includes(reason);
}
