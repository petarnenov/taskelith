import { isDeepStrictEqual } from 'node:util';
import { reviewerKey, secretLikeStrings, type Problem, type SchemaCheck } from './review-findings.ts';
import {
  passPlans,
  type PassPlans,
  type RouteFeatures,
  type RuleDecision,
  type ShadowDecision,
} from './review-route.ts';

// The route record, route.json: its shape, its validation against the
// schema and the reviewer table, and its printed summary.

export interface RouteRecord {
  readonly change: string;
  readonly generatedAt: string;
  readonly devCommit: string;
  readonly headCommit: string;
  readonly features: RouteFeatures;
  readonly rule: RuleDecision;
  readonly shadow: ShadowDecision;
}

export function formatRouteRecord(record: RouteRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

// Problems of a parsed route.json; none when it is valid. Schema
// violations come first, because the other checks assume the shape.
export function routeRecordProblems(value: unknown, change: string, checkSchema: SchemaCheck): string[] {
  const schemaProblems = checkSchema(value);
  if (schemaProblems.length > 0) return [...schemaProblems];
  const record = value as RouteRecord;
  return [
    ...changeProblems(record, change),
    ...secretProblems(record),
    ...ruleProblems(record),
    ...shadowProblems(record),
  ];
}

function changeProblems({ change }: RouteRecord, expected: string): string[] {
  return change === expected ? [] : [`change "${change}" is not its directory's change "${expected}"`];
}

// The value itself is never printed, only that one exists.
function secretProblems(record: RouteRecord): string[] {
  const secrets = secretLikeStrings(record).length;
  return secrets === 0 ? [] : [`${secrets} value(s) look like a secret`];
}

function ruleProblems({ rule, features }: RouteRecord): string[] {
  const problems: string[] = [];
  const elevated = rule.triggers.length > 0;
  if ((rule.tier === 'elevated') !== elevated) {
    problems.push(`rule tier ${rule.tier} does not match ${rule.triggers.length} fired trigger(s)`);
  }
  if (!isDeepStrictEqual(rule.passes, passPlans(rule.tier, features))) {
    problems.push(`rule passes are not the reviewer table's for tier ${rule.tier}`);
  }
  return problems;
}

function shadowProblems({ shadow, features }: RouteRecord): string[] {
  if (shadow.status !== 'answered' || isDeepStrictEqual(shadow.passes, passPlans(shadow.tier, features))) return [];
  return [`shadow passes are not the reviewer table's for tier ${shadow.tier}`];
}

// A change directory and its route.json, if any.
export interface RouteLocation {
  readonly directory: string;
  readonly change: string;
  readonly file?: { readonly path: string; readonly text: string };
}

export interface LocatedRoute {
  readonly location: RouteLocation;
  readonly record: RouteRecord;
}

// Every route.json, active and archived; a change without one is fine.
export function checkRoutes(locations: readonly RouteLocation[], checkSchema: SchemaCheck) {
  const located: LocatedRoute[] = [];
  const problems: Problem[] = [];
  for (const location of locations) {
    if (location.file === undefined) continue;
    const parsed = parseRouteRecord(location.file.text, location.change, checkSchema);
    if (parsed.record !== undefined) located.push({ location, record: parsed.record });
    problems.push(...parsed.problems.map((message) => ({ file: location.file!.path, message })));
  }
  return { located, problems };
}

function parseRouteRecord(text: string, change: string, checkSchema: SchemaCheck): { record?: RouteRecord; problems: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problems: ['not valid JSON'] };
  }
  const problems = routeRecordProblems(value, change, checkSchema);
  return problems.length === 0 ? { record: value as RouteRecord, problems } : { problems };
}

export function formatRouteSummary({ rule, shadow }: RouteRecord): string {
  const triggers = rule.triggers.length === 0 ? 'no trigger' : rule.triggers.join(', ');
  return [
    `route: ${rule.tier} (${triggers}), rule version ${rule.version}`,
    `pass 1, reviewer A: ${reviewerKey(rule.passes[0].reviewer)}`,
    `pass 2, reviewer B: ${reviewerKey(rule.passes[1].reviewer)}`,
    `shadow: ${shadowSummary(shadow, rule)}`,
    'Recommendation only: the brief names the reviewers, and an effort above standard needs governance authorization.',
  ].join('\n');
}

function shadowSummary(shadow: ShadowDecision, rule: RuleDecision): string {
  if (shadow.status === 'skipped') return 'skipped';
  if (shadow.status === 'failed') return `failed (${shadow.reason}); the rule decided alone`;
  const agreement = shadow.tier === rule.tier ? 'agrees with the rule' : 'disagrees with the rule';
  const probability = shadow.probabilities[shadow.tier].toFixed(2);
  return `${shadow.model} ${shadow.tier} (${probability}), would assign ${planKeys(shadow.passes)}; ${agreement}`;
}

function planKeys(passes: PassPlans): string {
  return passes.map(({ reviewer }) => reviewerKey(reviewer)).join(', ');
}
