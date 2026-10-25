// The scheduler's reasons of contract section 11. A waiting reason leaves the
// task queued; a rejecting reason ends its admission to capacity.
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

export const REJECTING_REASONS = Object.freeze([
  'attempt-already-reserved',
  'attempt-not-reservable',
  'resource-ceiling-exceeded',
  'spend-limit-not-enforceable',
  'delegation-depth-exceeded',
  'delegation-chain-exceeds-quota',
  'delegation-budget-exhausted',
  'retry-budget-exhausted',
] as const);

export type WaitingReason = (typeof WAITING_REASONS)[number];
export type RejectingReason = (typeof REJECTING_REASONS)[number];
export type CapacityReason = WaitingReason | RejectingReason;

export function isWaitingReason(reason: CapacityReason): reason is WaitingReason {
  return (WAITING_REASONS as readonly string[]).includes(reason);
}
