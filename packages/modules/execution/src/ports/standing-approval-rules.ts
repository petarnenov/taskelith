import type { Instant, Result } from '@taskelith/kernel';
import type { OwnershipGeneration, PolicyRevision, ProjectId } from '@taskelith/sdlc';
import type { AttemptId, NativeRequestId, PrincipalId, StandingRuleId } from '../domain/identifiers.js';

export type { StandingRuleId };

// Normalized operations a rule may approve; the harness port classifies a
// native request, and an unclassified request matches no rule.
export const STANDING_RULE_OPERATIONS = Object.freeze(['push-to-task-branch'] as const);

export type StandingRuleOperation = (typeof STANDING_RULE_OPERATIONS)[number];

export const STANDING_RULE_ORIGINS = Object.freeze(['maintainer', 'auto-merge'] as const);

export type StandingRuleOrigin = (typeof STANDING_RULE_ORIGINS)[number];

export interface StandingRuleRevocation {
  readonly revokedBy: PrincipalId;
  readonly revokedAt: Instant;
  readonly reason: string;
}

export interface StandingRule {
  readonly id: StandingRuleId;
  readonly projectId: ProjectId;
  readonly author: PrincipalId;
  readonly operation: StandingRuleOperation;
  readonly policyRevision: PolicyRevision;
  readonly origin: StandingRuleOrigin;
  readonly createdAt: Instant;
  readonly revocation?: StandingRuleRevocation;
}

export interface StandingRuleUse {
  readonly ruleId: StandingRuleId;
  readonly nativeRequestId: NativeRequestId;
  readonly attemptId: AttemptId;
  readonly attemptGeneration: OwnershipGeneration;
  readonly policyRevision: PolicyRevision;
  readonly usedAt: Instant;
}

// Idempotent by rule identifier, and audited; a use is recorded in the
// transaction that answers the request, and never by a revoked rule.
export interface StandingApprovalRules {
  // Only rules whose revision equals the run's current one (section 5).
  active(
    projectId: ProjectId,
    operation: StandingRuleOperation,
    policyRevision: PolicyRevision,
  ): Promise<Result<readonly StandingRule[]>>;
  record(rule: StandingRule): Promise<Result<StandingRule>>;
  revoke(ruleId: StandingRuleId, revocation: StandingRuleRevocation): Promise<Result<StandingRule>>;
  recordUse(use: StandingRuleUse): Promise<Result<StandingRuleUse>>;
}
