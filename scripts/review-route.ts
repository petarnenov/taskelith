import type { Size } from './checklist-record.ts';
import type { Reviewer, Role } from './review-findings.ts';

// Domain and port of the review route: the router input, the decisions,
// and the reviewer table that maps a tier to the plans of passes 1 and 2.

export const ROUTE_FILE = 'route.json';
export const ROUTE_SCHEMA_PATH = 'docs/review-findings/route.schema.json';

export const TIERS = ['standard', 'elevated'] as const;
export type Tier = (typeof TIERS)[number];

export const TRIGGERS = ['lines', 'files', 'capabilities', 'security', 'contracts', 'docker', 'size'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TOUCH_KINDS = ['code', 'tests', 'contracts', 'specs', 'docker', 'security', 'docsOnly'] as const;
export type TouchKind = (typeof TOUCH_KINDS)[number];
export type Touches = Readonly<Record<TouchKind, boolean>>;

export interface CapabilityHistory {
  readonly changes: number;
  readonly thirdPassShare: number | null;
  readonly mediumOrWorsePerChange: number | null;
}

export interface RouteFeatures {
  readonly linesChanged: number;
  readonly filesChanged: number;
  readonly capabilities: readonly string[];
  readonly touches: Touches;
  readonly externalFacts: boolean;
  readonly size: Size | null;
  readonly capabilityHistory: CapabilityHistory;
}

export interface PassPlan {
  readonly pass: 1 | 2;
  readonly role: Role;
  readonly reviewer: Required<Reviewer>;
}

export type PassPlans = readonly [PassPlan, PassPlan];

export interface RouteDecision {
  readonly tier: Tier;
  readonly passes: PassPlans;
}

export interface RuleDecision extends RouteDecision {
  readonly version: number;
  readonly triggers: readonly Trigger[];
}

export const SHADOW_ROUTER = 'jev';

export const SHADOW_FAILURES = [
  'missing-credential',
  'timeout',
  'network',
  'rate-limited',
  'overloaded',
  'http-error',
  'invalid-response',
] as const;
export type ShadowFailure = (typeof SHADOW_FAILURES)[number];

export interface AnsweredShadow extends RouteDecision {
  readonly router: typeof SHADOW_ROUTER;
  readonly status: 'answered';
  readonly model: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<Tier, number>>;
  readonly expectedPasses: number;
  readonly latencyMs: number;
}

export interface FailedShadow {
  readonly router: typeof SHADOW_ROUTER;
  readonly status: 'failed';
  readonly reason: ShadowFailure;
  readonly httpStatus?: number;
  readonly latencyMs: number;
}

export interface SkippedShadow {
  readonly router: typeof SHADOW_ROUTER;
  readonly status: 'skipped';
}

export type ShadowDecision = AnsweredShadow | FailedShadow | SkippedShadow;

export const SKIPPED_SHADOW: SkippedShadow = { router: SHADOW_ROUTER, status: 'skipped' };

// The port. The rule adapter never fails; a shadow adapter resolves to a
// failed decision instead of rejecting.
export interface ReviewRouter<Decision> {
  route(features: RouteFeatures): Promise<Decision>;
}

// The version of the rule's triggers and of its reviewer table. A change
// of either bumps it; older tables stay, so archived records stay valid.
export const RULE_VERSION = 1;

interface TierEfforts {
  readonly reviewerA: string;
  readonly reviewerB: string;
}

interface ReviewerTable {
  readonly reviewerA: Pick<Reviewer, 'harness' | 'model'>;
  readonly networkedReviewerA: Pick<Reviewer, 'harness' | 'model'>;
  readonly reviewerB: Pick<Reviewer, 'harness' | 'model'>;
  readonly efforts: Readonly<Record<Tier, TierEfforts>>;
}

// standard is the configured effort of the reviewer assignment of
// 2026-10-27; elevated is a recommendation until governance allows it.
const REVIEWER_TABLES: ReadonlyMap<number, ReviewerTable> = new Map([
  [
    1,
    {
      reviewerA: { harness: 'codex', model: 'gpt-6.1-sol' },
      networkedReviewerA: { harness: 'claude', model: 'claude-fable-5-1' },
      reviewerB: { harness: 'claude', model: 'claude-opus-5-5' },
      efforts: {
        standard: { reviewerA: 'medium', reviewerB: 'high' },
        elevated: { reviewerA: 'high', reviewerB: 'xhigh' },
      },
    },
  ],
]);

type PlanFeatures = Pick<RouteFeatures, 'externalFacts'>;

// The plans of the current rule version.
export function passPlans(tier: Tier, features: PlanFeatures): PassPlans {
  return tablePlans(REVIEWER_TABLES.get(RULE_VERSION)!, tier, features);
}

// The plans of the given rule version; undefined for an unknown version.
export function versionedPassPlans(version: number, tier: Tier, features: PlanFeatures): PassPlans | undefined {
  const table = REVIEWER_TABLES.get(version);
  return table === undefined ? undefined : tablePlans(table, tier, features);
}

function tablePlans(table: ReviewerTable, tier: Tier, { externalFacts }: PlanFeatures): PassPlans {
  const efforts = table.efforts[tier];
  const reviewerA = externalFacts ? table.networkedReviewerA : table.reviewerA;
  return [
    { pass: 1, role: 'A', reviewer: { ...reviewerA, variant: efforts.reviewerA } },
    { pass: 2, role: 'B', reviewer: { ...table.reviewerB, variant: efforts.reviewerB } },
  ];
}
