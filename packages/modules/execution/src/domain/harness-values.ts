// Harness port values that the session timeline records; the agent harness
// port re-exports them, since a domain file cannot import a port.
export const TURN_OUTCOMES = Object.freeze([
  'completed',
  'interrupted',
  'turn-limit-reached',
  'account-limit-reached',
  'failed',
] as const);

export type TurnOutcome = (typeof TURN_OUTCOMES)[number];

export const HARNESS_FAILURES = Object.freeze(['authentication', 'transport', 'harness-exited', 'protocol', 'internal'] as const);

export type HarnessFailure = (typeof HARNESS_FAILURES)[number];

export const PERMISSION_DECISIONS = Object.freeze(['allow', 'deny'] as const);

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

export const DELEGATION_OUTCOMES = Object.freeze(['completed', 'rejected', 'failed', 'cancelled'] as const);

export type DelegationOutcome = (typeof DELEGATION_OUTCOMES)[number];

export const MAX_HARNESS_TEXT_LENGTH = 65_536;

export type HarnessRequestKind = 'permission-request' | 'input-request' | 'delegation-request';
