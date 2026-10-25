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
