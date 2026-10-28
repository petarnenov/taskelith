import { reviewerKey, type Reviewer } from './review-findings.ts';
import type { ShadowDecision, ShadowFailure, Tier, Trigger } from './review-route.ts';
import {
  formatOutcomeFigures,
  formatRoutingFigures,
  percent,
  reviewOutcome,
  routingFigures,
  type RecordLine,
  type RoutingFigures,
  type SeverityCounts,
} from './review-route-effect.ts';
import type { RouteRecord } from './review-route-record.ts';

// The routing section of the effect command: one row per archived change
// with route.json against the reviewers and passes it actually had.

export interface ReviewedLine extends RecordLine {
  readonly reviewer: Reviewer;
}

export interface RoutedReview {
  readonly route: RouteRecord;
  readonly findings: readonly ReviewedLine[];
  // Undefined without passes.jsonl.
  readonly summaries: readonly ReviewedLine[] | undefined;
}

export type ShadowRow =
  | { readonly status: 'answered'; readonly tier: Tier; readonly elevated: number }
  | { readonly status: 'failed'; readonly reason: ShadowFailure }
  | { readonly status: 'skipped' };

export interface RoutingRow {
  readonly change: string;
  readonly rule: { readonly tier: Tier; readonly triggers: readonly Trigger[] };
  readonly shadow: ShadowRow;
  // Reviewer keys that the rule recommended for passes 1 and 2.
  readonly route: { readonly pass1: string; readonly pass2: string };
  // Reviewer keys of the passes that ran; null for a pass without a record.
  readonly reviewers: { readonly pass1: string | null; readonly pass2: string | null };
  // Null when no pass 1 is recorded.
  readonly followedRoute: boolean | null;
  readonly passesNeeded: number;
  readonly thirdPass: boolean;
  readonly findings: { readonly pass1: SeverityCounts; readonly pass2: SeverityCounts };
}

export interface RouteFollowing {
  readonly changes: number;
  readonly following: number;
  readonly share: number | null;
}

export interface RoutingEffect {
  readonly rows: readonly RoutingRow[];
  readonly unrouted: readonly string[];
  readonly figures: RoutingFigures;
  readonly followedRoute: RouteFollowing;
}

export function routingEffect(reviews: readonly RoutedReview[], unrouted: readonly string[]): RoutingEffect {
  const routed = reviews.map((review) => ({ review, outcome: reviewOutcome({ findings: review.findings, passes: review.summaries }) }));
  const rows = routed.map(({ review, outcome }): RoutingRow => {
    const reviewers = { pass1: reviewerOfPass(review, 1), pass2: reviewerOfPass(review, 2) };
    const { change, rule, shadow } = review.route;
    const [planA, planB] = rule.passes.map(({ reviewer }) => reviewerKey(reviewer));
    const route = { pass1: planA, pass2: planB };
    return {
      change,
      rule: { tier: rule.tier, triggers: rule.triggers },
      shadow: shadowRow(shadow),
      route,
      reviewers,
      followedRoute: followed(reviewers, route),
      passesNeeded: outcome.passesNeeded,
      thirdPass: outcome.thirdPass,
      findings: outcome.findings,
    };
  });
  const figures = routingFigures(routed.map(({ review, outcome }) =>
    ({ change: review.route.change, rule: review.route.rule.tier, shadow: review.route.shadow, outcome })));
  return { rows, unrouted, figures, followedRoute: following(rows) };
}

// Pass summaries name the reviewer of a pass without findings too.
function reviewerOfPass({ findings, summaries }: RoutedReview, pass: number): string | null {
  const line = summaries?.find((summary) => summary.pass === pass) ?? findings.find((finding) => finding.pass === pass);
  return line === undefined ? null : reviewerKey(line.reviewer);
}

function shadowRow(shadow: ShadowDecision): ShadowRow {
  if (shadow.status === 'answered') return { status: 'answered', tier: shadow.tier, elevated: shadow.probabilities.elevated };
  if (shadow.status === 'failed') return { status: 'failed', reason: shadow.reason };
  return { status: 'skipped' };
}

// A review that ended after pass 1 follows the route by its pass 1 alone.
function followed({ pass1, pass2 }: RoutingRow['reviewers'], route: RoutingRow['route']): boolean | null {
  if (pass1 === null) return null;
  return pass1 === route.pass1 && (pass2 === null || pass2 === route.pass2);
}

function following(rows: readonly RoutingRow[]): RouteFollowing {
  const known = rows.filter(({ followedRoute }) => followedRoute !== null);
  const count = known.filter(({ followedRoute }) => followedRoute).length;
  return { changes: known.length, following: count, share: known.length === 0 ? null : Math.round((count / known.length) * 1000) / 1000 };
}

export function formatRoutingEffect(effect: RoutingEffect): string {
  const { rows, unrouted, figures, followedRoute } = effect;
  return [
    `Routing over archived changes with route.json: ${rows.length} change(s); ${unrouted.length} archived change(s) without one are excluded.`,
    ...rows.map((row) => `  ${formatRow(row)}`),
    `  ${formatOutcomeFigures('all', figures.all)}`,
    ...formatRoutingFigures(figures),
    `  followed the route: ${followedRoute.following} of ${followedRoute.changes} change(s) with a recorded pass 1 (${percent(followedRoute.share)})`,
  ].join('\n');
}

function formatRow(row: RoutingRow): string {
  const triggers = row.rule.triggers.length === 0 ? 'no trigger' : row.rule.triggers.join(', ');
  return [
    `${row.change}: rule ${row.rule.tier} (${triggers}), shadow ${formatShadow(row.shadow)}`,
    formatReviewers(row),
    `passes ${row.passesNeeded}, ${row.thirdPass ? 'third pass' : 'no third pass'}`,
    `pass 1 ${formatCounts(row.findings.pass1)}, pass 2 ${formatCounts(row.findings.pass2)}`,
  ].join('; ');
}

function formatShadow(shadow: ShadowRow): string {
  if (shadow.status === 'answered') return `${shadow.tier} (P(elevated) ${shadow.elevated.toFixed(2)})`;
  if (shadow.status === 'failed') return `failed (${shadow.reason})`;
  return 'skipped';
}

function formatReviewers({ reviewers, route, followedRoute }: RoutingRow): string {
  if (reviewers.pass1 === null) return 'no recorded pass';
  const ran = `pass 1 ${reviewers.pass1}, pass 2 ${reviewers.pass2 ?? 'none'}`;
  return followedRoute ? `${ran}, followed the route` : `${ran}, not the route (${route.pass1}, ${route.pass2})`;
}

function formatCounts({ critical, high, medium, low }: SeverityCounts): string {
  return `C${critical} H${high} M${medium} L${low}`;
}
