import type { Severity } from './review-findings.ts';
import {
  isThirdPassAnswer,
  SHADOW_FAILURES,
  TIERS,
  type AnsweredShadow,
  type LegacyAnsweredShadow,
  type ShadowDecision,
  type ShadowFailure,
  type Tier,
} from './review-route.ts';

// Pure routing figures of routed changes against their review outcome:
// the third pass share per tier, agreement, and the shadow's errors.

export const THIRD_PASS = 3;

export type SeverityCounts = Readonly<Record<Severity, number>>;

export const NO_FINDINGS: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

export interface ReviewOutcome {
  // The highest recorded pass; a lower bound without pass summaries.
  readonly passesNeeded: number;
  readonly thirdPass: boolean;
  readonly passSummaries: boolean;
  readonly findings: { readonly pass1: SeverityCounts; readonly pass2: SeverityCounts };
}

// The pass and severity of a findings.jsonl or passes.jsonl line.
export interface RecordLine {
  readonly pass?: number;
  readonly severity?: Severity;
  readonly artifact?: string;
}

export interface ReviewRecords {
  readonly findings: readonly RecordLine[];
  // Undefined without passes.jsonl.
  readonly passes: readonly RecordLine[] | undefined;
}

// At least one pass ran, also when it recorded nothing. A review that the
// conditional third pass ended after pass 2 has two passes.
export function reviewOutcome(records: ReviewRecords): ReviewOutcome {
  const passNumbers = [...records.findings, ...(records.passes ?? [])].map(({ pass }) => pass ?? 0);
  const passesNeeded = Math.max(1, ...passNumbers);
  return {
    passesNeeded,
    thirdPass: passesNeeded >= THIRD_PASS,
    passSummaries: records.passes !== undefined,
    findings: { pass1: severityCounts(records.findings, 1), pass2: severityCounts(records.findings, 2) },
  };
}

function severityCounts(findings: readonly RecordLine[], pass: number): SeverityCounts {
  const counts: Record<Severity, number> = { ...NO_FINDINGS };
  for (const { severity } of findings.filter((finding) => finding.pass === pass)) {
    if (severity !== undefined && severity in counts) counts[severity] += 1;
  }
  return counts;
}

export interface RoutedChange {
  readonly change: string;
  readonly rule: Tier;
  readonly shadow: ShadowDecision;
  readonly outcome: ReviewOutcome;
}

export interface OutcomeFigures {
  readonly changes: number;
  readonly thirdPasses: number;
  readonly thirdPassShare: number | null;
  readonly meanPasses: number | null;
  readonly passOneFindingsPerChange: number | null;
  readonly mediumOrWorsePerChange: number | null;
}

export type TierFigures = Readonly<Record<Tier, OutcomeFigures>>;

export interface Agreement {
  readonly changes: number;
  readonly agreeing: number;
  readonly share: number | null;
  readonly kappa: number | null;
}

// Scores of P(third) against the outcome; AUC is null without both
// outcomes.
export interface ThirdPassScore {
  readonly changes: number;
  readonly brierScore: number | null;
  readonly auc: number | null;
}

// Scores of the answers to the earlier tier and passes questions.
export interface TierRequestScore {
  readonly changes: number;
  readonly brierScore: number | null;
  readonly passesMeanAbsoluteError: number | null;
}

export interface ShadowFigures {
  readonly answered: number;
  readonly failed: Readonly<Partial<Record<ShadowFailure, number>>>;
  readonly skipped: number;
  readonly tiers: TierFigures;
  readonly agreement: Agreement;
  readonly thirdPass: ThirdPassScore;
  readonly tierRequest: TierRequestScore;
}

export interface RoutingFigures {
  readonly all: OutcomeFigures;
  readonly rule: TierFigures;
  readonly shadow: ShadowFigures;
}

const rounded = (value: number) => Math.round(value * 1000) / 1000;
const mean = (values: readonly number[]) =>
  values.length === 0 ? null : rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
const countOf = (counts: SeverityCounts) => counts.critical + counts.high + counts.medium + counts.low;
const mediumOrWorse = (counts: SeverityCounts) => counts.critical + counts.high + counts.medium;

export function outcomeFigures(outcomes: readonly ReviewOutcome[]): OutcomeFigures {
  const thirdPasses = outcomes.filter(({ thirdPass }) => thirdPass).length;
  return {
    changes: outcomes.length,
    thirdPasses,
    thirdPassShare: outcomes.length === 0 ? null : rounded(thirdPasses / outcomes.length),
    meanPasses: mean(outcomes.map(({ passesNeeded }) => passesNeeded)),
    passOneFindingsPerChange: mean(outcomes.map(({ findings }) => countOf(findings.pass1))),
    mediumOrWorsePerChange: mean(outcomes.map(({ findings }) => mediumOrWorse(findings.pass1) + mediumOrWorse(findings.pass2))),
  };
}

function tierFigures<Change extends RoutedChange>(changes: readonly Change[], tierOf: (change: Change) => Tier): TierFigures {
  const figuresOf = (tier: Tier) => outcomeFigures(changes.filter((change) => tierOf(change) === tier).map(({ outcome }) => outcome));
  return { standard: figuresOf('standard'), elevated: figuresOf('elevated') };
}

type Answered = RoutedChange & { readonly shadow: AnsweredShadow | LegacyAnsweredShadow };
type ThirdPassAnswered = RoutedChange & { readonly shadow: AnsweredShadow };
type LegacyAnswered = RoutedChange & { readonly shadow: LegacyAnsweredShadow };

const isAnswered = (change: RoutedChange): change is Answered => change.shadow.status === 'answered';
const isThirdPassAnswered = (change: Answered): change is ThirdPassAnswered => isThirdPassAnswer(change.shadow);
const isLegacyAnswered = (change: Answered): change is LegacyAnswered => !isThirdPassAnswer(change.shadow);

export function routingFigures(changes: readonly RoutedChange[]): RoutingFigures {
  return {
    all: outcomeFigures(changes.map(({ outcome }) => outcome)),
    rule: tierFigures(changes, ({ rule }) => rule),
    shadow: shadowFigures(changes),
  };
}

// Failed and skipped shadows are counted, not scored.
function shadowFigures(changes: readonly RoutedChange[]): ShadowFigures {
  const answered = changes.filter(isAnswered);
  return {
    answered: answered.length,
    failed: failureCounts(changes),
    skipped: changes.filter(({ shadow }) => shadow.status === 'skipped').length,
    tiers: tierFigures(answered, ({ shadow }) => shadow.tier),
    agreement: agreement(answered),
    thirdPass: thirdPassScore(answered.filter(isThirdPassAnswered)),
    tierRequest: tierRequestScore(answered.filter(isLegacyAnswered)),
  };
}

function tierRequestScore(legacy: readonly LegacyAnswered[]): TierRequestScore {
  return {
    changes: legacy.length,
    brierScore: mean(legacy.map(({ shadow, outcome }) => (shadow.probabilities.elevated - Number(outcome.thirdPass)) ** 2)),
    passesMeanAbsoluteError: mean(legacy.map(({ shadow, outcome }) => Math.abs(shadow.expectedPasses - outcome.passesNeeded))),
  };
}

function thirdPassScore(answered: readonly ThirdPassAnswered[]): ThirdPassScore {
  const forecasts = answered.map(({ shadow, outcome }) => ({ probability: shadow.thirdPassProbability, thirdPass: outcome.thirdPass }));
  return {
    changes: forecasts.length,
    brierScore: mean(forecasts.map(({ probability, thirdPass }) => (probability - Number(thirdPass)) ** 2)),
    auc: areaUnderCurve(forecasts),
  };
}

interface Forecast {
  readonly probability: number;
  readonly thirdPass: boolean;
}

// The share of third pass and other pairs that the probability orders
// correctly; ties count half.
export function areaUnderCurve(forecasts: readonly Forecast[]): number | null {
  const positives = forecasts.filter(({ thirdPass }) => thirdPass).map(({ probability }) => probability);
  const negatives = forecasts.filter(({ thirdPass }) => !thirdPass).map(({ probability }) => probability);
  if (positives.length === 0 || negatives.length === 0) return null;
  const pairScore = (positive: number, negative: number) => (positive > negative ? 1 : positive === negative ? 0.5 : 0);
  const total = positives.reduce((sum, positive) => sum + negatives.reduce((inner, negative) => inner + pairScore(positive, negative), 0), 0);
  return rounded(total / (positives.length * negatives.length));
}

function failureCounts(changes: readonly RoutedChange[]): Partial<Record<ShadowFailure, number>> {
  const counts: Partial<Record<ShadowFailure, number>> = {};
  for (const reason of SHADOW_FAILURES) {
    const count = changes.filter(({ shadow }) => shadow.status === 'failed' && shadow.reason === reason).length;
    if (count > 0) counts[reason] = count;
  }
  return counts;
}

// Cohen's kappa of the rule and shadow tiers; null when chance agreement
// is certain, because kappa is then undefined.
export function agreement(answered: readonly Answered[]): Agreement {
  const total = answered.length;
  const agreeing = answered.filter(({ rule, shadow }) => rule === shadow.tier).length;
  if (total === 0) return { changes: 0, agreeing: 0, share: null, kappa: null };
  const share = agreeing / total;
  const marginal = (tier: Tier, pick: (change: Answered) => Tier) => answered.filter((change) => pick(change) === tier).length / total;
  const chance = TIERS.reduce((sum, tier) => sum + marginal(tier, ({ rule }) => rule) * marginal(tier, ({ shadow }) => shadow.tier), 0);
  return { changes: total, agreeing, share: rounded(share), kappa: chance === 1 ? null : rounded((share - chance) / (1 - chance)) };
}

export const percent = (share: number | null) => (share === null ? 'n/a' : `${Math.round(share * 100)}%`);
const figure = (value: number | null) => (value === null ? 'n/a' : value.toFixed(2));

export function formatOutcomeFigures(label: string, figures: OutcomeFigures): string {
  const { changes, thirdPasses, thirdPassShare, meanPasses, passOneFindingsPerChange, mediumOrWorsePerChange } = figures;
  return [
    `${label}: ${changes} change(s), third pass ${thirdPasses} (${percent(thirdPassShare)})`,
    `mean passes ${figure(meanPasses)}`,
    `pass-1 findings per change ${figure(passOneFindingsPerChange)}`,
    `medium or worse in passes 1-2 per change ${figure(mediumOrWorsePerChange)}`,
  ].join(', ');
}

export function formatRoutingFigures({ rule, shadow }: RoutingFigures): string[] {
  const lines = TIERS.map((tier) => `  ${formatOutcomeFigures(`rule ${tier}`, rule[tier])}`);
  if (shadow.answered === 0) return [...lines, `  shadow: no answer (${shadowCounts(shadow)})`];
  const { agreement: agreed } = shadow;
  const { thirdPass, tierRequest } = shadow;
  return [
    ...lines,
    ...TIERS.map((tier) => `  ${formatOutcomeFigures(`shadow ${tier}`, shadow.tiers[tier])}`),
    `  shadow: ${shadowCounts(shadow)}; agreement ${agreed.agreeing} of ${agreed.changes} (${percent(agreed.share)}), kappa ${figure(agreed.kappa)}`,
    ...(thirdPass.changes === 0 ? [] : [
      `  shadow: P(third) of ${thirdPass.changes} change(s), Brier score ${figure(thirdPass.brierScore)}, AUC ${figure(thirdPass.auc)}`,
    ]),
    ...(tierRequest.changes === 0 ? [] : [
      `  shadow: tier request of ${tierRequest.changes} change(s), Brier score of P(elevated) ${figure(tierRequest.brierScore)}, mean absolute error of passes ${figure(tierRequest.passesMeanAbsoluteError)}`,
    ]),
  ];
}

function shadowCounts({ answered, failed, skipped }: ShadowFigures): string {
  const failures = Object.entries(failed).map(([reason, count]) => `${reason} ${count}`);
  const failedText = failures.length === 0 ? 'failed 0' : `failed ${failures.join(', ')}`;
  return `answered ${answered}, ${failedText}, skipped ${skipped}`;
}
