import type { Size } from './checklist-record.ts';
import type { Reviewer, Role } from './review-findings.ts';

// Domain and port of the review route: the router input, the decisions,
// and the reviewer table that maps a tier to the plan of each pass.

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

export type PassNumber = 1 | 2 | 3;

export interface PassPlan {
  readonly pass: PassNumber;
  readonly role: Role;
  readonly reviewer: Required<Reviewer>;
}

// Rule version 1 plans passes 1 and 2; version 2 adds pass 3.
export type PassPlans = readonly PassPlan[];

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
  'input-unavailable',
  'timeout',
  'network',
  'rate-limited',
  'overloaded',
  'http-error',
  'invalid-response',
] as const;
export type ShadowFailure = (typeof SHADOW_FAILURES)[number];

// An answer to the third pass question: P(third) and the tier that the
// threshold maps it to.
export interface AnsweredShadow extends RouteDecision {
  readonly router: typeof SHADOW_ROUTER;
  readonly status: 'answered';
  readonly model: string;
  readonly thirdPassProbability: number;
  readonly threshold: number;
  readonly latencyMs: number;
}

// An answer to the tier and passes questions of archived records.
export interface LegacyAnsweredShadow extends RouteDecision {
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

export type ShadowDecision = AnsweredShadow | LegacyAnsweredShadow | FailedShadow | SkippedShadow;

export function isThirdPassAnswer(shadow: ShadowDecision): shadow is AnsweredShadow {
  return shadow.status === 'answered' && 'thirdPassProbability' in shadow;
}

// The shadow tier of a third pass probability.
export function tierAt(thirdPassProbability: number, threshold: number): Tier {
  return thirdPassProbability >= threshold ? 'elevated' : 'standard';
}

export const SKIPPED_SHADOW: SkippedShadow = { router: SHADOW_ROUTER, status: 'skipped' };

export const LINE_BANDS = [
  { label: 'under 100 lines', below: 100 },
  { label: '100 to 399 lines', below: 400 },
  { label: '400 lines and more', below: Number.POSITIVE_INFINITY },
] as const;

export interface BandRate {
  readonly band: string;
  readonly changes: number;
  readonly thirdPassShare: number | null;
}

// Third pass shares of archived reviewed changes, the routed one excluded.
export interface ReferenceRates {
  readonly changes: number;
  readonly thirdPassShare: number | null;
  readonly byLinesChanged: readonly BandRate[];
}

// The change's proposal sections, unclipped, and its plan counts.
export interface ChangeContent {
  readonly why: string;
  readonly whatChanges: string;
  readonly taskCount: number;
  readonly specRequirementCount: number;
}

export interface ShadowInput {
  readonly features: RouteFeatures;
  readonly reference: ReferenceRates;
  readonly content: ChangeContent;
}

// Built only when the shadow router can use it.
export type ShadowInputSource = () => ShadowInput;

// The port. The rule adapter never fails; a shadow adapter resolves to a
// failed decision instead of rejecting.
export interface ReviewRouter<Decision, Input = RouteFeatures> {
  route(input: Input): Promise<Decision>;
}

// The version of the rule's thresholds and of its reviewer table. A change
// of either bumps it; older ones stay, so archived records stay valid.
export const RULE_VERSION = 3;

type ReviewerModel = Pick<Reviewer, 'harness' | 'model'>;

// One planned pass: its reviewer, the networked one for a change with
// external facts, and the effort of each tier.
interface PassSeat {
  readonly pass: PassNumber;
  readonly role: Role;
  readonly reviewer: ReviewerModel;
  readonly networkedReviewer: ReviewerModel;
  readonly efforts: Readonly<Record<Tier, string>>;
}

type ReviewerTable = readonly PassSeat[];

export interface TriggerThresholds {
  readonly linesChanged: number;
  readonly filesChanged: number;
  readonly capabilities: number;
  readonly elevatedSizes: readonly Size[];
}

const THRESHOLDS_V1: TriggerThresholds = { linesChanged: 400, filesChanged: 18, capabilities: 3, elevatedSizes: ['M-L', 'L'] };

// The thresholds of design.md "Rule table", per rule version.
const TRIGGER_THRESHOLDS: ReadonlyMap<number, TriggerThresholds> = new Map([
  [1, THRESHOLDS_V1],
  [2, THRESHOLDS_V1],
  [3, THRESHOLDS_V1],
]);

// Undefined for an unknown rule version.
export function triggerThresholds(version: number): TriggerThresholds | undefined {
  return TRIGGER_THRESHOLDS.get(version);
}

const SOL: ReviewerModel = { harness: 'codex', model: 'gpt-6.1-sol' };
const ASTRA: ReviewerModel = { harness: 'codex', model: 'gpt-6-astra' };
const FABLE: ReviewerModel = { harness: 'claude', model: 'claude-fable-5-1' };
const OPUS: ReviewerModel = { harness: 'claude', model: 'claude-opus-5-5' };

// Version 1: the reviewer assignment of 2026-10-27, passes 1 and 2.
const REVIEWER_TABLE_V1: ReviewerTable = [
  { pass: 1, role: 'A', reviewer: SOL, networkedReviewer: FABLE, efforts: { standard: 'medium', elevated: 'high' } },
  { pass: 2, role: 'B', reviewer: OPUS, networkedReviewer: OPUS, efforts: { standard: 'high', elevated: 'xhigh' } },
];

// Version 2: the review sequence of 2026-10-28; pass 3 runs only after a
// pass 2 with a Medium or worse finding. elevated is unauthorized.
const REVIEWER_TABLE_V2: ReviewerTable = [
  { pass: 1, role: 'A', reviewer: ASTRA, networkedReviewer: FABLE, efforts: { standard: 'medium', elevated: 'high' } },
  { pass: 2, role: 'B', reviewer: OPUS, networkedReviewer: OPUS, efforts: { standard: 'medium', elevated: 'xhigh' } },
  { pass: 3, role: 'A', reviewer: SOL, networkedReviewer: FABLE, efforts: { standard: 'medium', elevated: 'high' } },
];

// Version 3: fable reviews pass 2 since 2026-10-29; opus keeps it for a
// change with external facts. elevated is unauthorized.
const REVIEWER_TABLE_V3: ReviewerTable = [
  { pass: 1, role: 'A', reviewer: ASTRA, networkedReviewer: FABLE, efforts: { standard: 'medium', elevated: 'high' } },
  { pass: 2, role: 'B', reviewer: FABLE, networkedReviewer: OPUS, efforts: { standard: 'medium', elevated: 'high' } },
  { pass: 3, role: 'A', reviewer: SOL, networkedReviewer: FABLE, efforts: { standard: 'medium', elevated: 'high' } },
];

const REVIEWER_TABLES: ReadonlyMap<number, ReviewerTable> = new Map([
  [1, REVIEWER_TABLE_V1],
  [2, REVIEWER_TABLE_V2],
  [3, REVIEWER_TABLE_V3],
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
  return table.map(({ pass, role, reviewer, networkedReviewer, efforts }) => ({
    pass,
    role,
    reviewer: { ...(externalFacts ? networkedReviewer : reviewer), variant: efforts[tier] },
  }));
}
