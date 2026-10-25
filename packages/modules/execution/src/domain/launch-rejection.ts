// The reasons of the launch authorization contract, section 9, in the order
// the authorization checks them; the scheduler acts on the reason.
export const LAUNCH_REJECTION_REASONS = Object.freeze([
  'quarantined',
  'stale-recovery-epoch',
  'worker-not-authorized',
  'assignment-not-active',
  'stale-ownership-generation',
  'attempt-not-launchable',
  'admission-not-current',
  'gate-not-passed',
  'artifact-revision-changed',
  'policy-revision-changed',
  'capacity-not-reserved',
  'execution-conflict',
  'operation-mismatch',
  'unavailable',
] as const);

export type LaunchRejectionReason = (typeof LAUNCH_REJECTION_REASONS)[number];

// Only these are retried by the worker, each time under a new operationId;
// a rejection is final for its operation (contract section 6).
export const RETRYABLE_LAUNCH_REJECTIONS: readonly LaunchRejectionReason[] = Object.freeze(['quarantined', 'unavailable']);

export interface LaunchRejection {
  readonly reason: LaunchRejectionReason;
  readonly retryable: boolean;
  readonly message: string;
}

export function launchRejection(reason: LaunchRejectionReason, message: string): LaunchRejection {
  return Object.freeze({ reason, retryable: RETRYABLE_LAUNCH_REJECTIONS.includes(reason), message });
}

// The reasons a writer that changes a compared value revokes a grant with
// (contract section 5): the check that value would now fail.
export const REVOCATION_REASONS = Object.freeze([
  'quarantined',
  'worker-not-authorized',
  'stale-ownership-generation',
  'attempt-not-launchable',
  'gate-not-passed',
  'artifact-revision-changed',
  'policy-revision-changed',
  'capacity-not-reserved',
] as const satisfies readonly LaunchRejectionReason[]);

export type RevocationReason = (typeof REVOCATION_REASONS)[number];
