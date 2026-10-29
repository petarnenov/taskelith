import assert from 'node:assert/strict';
import test from 'node:test';
import { passPlans, SKIPPED_SHADOW, versionedPassPlans, type ShadowDecision } from '../scripts/review-route.ts';
import { routeSchemaCheck } from '../scripts/review-route-command.ts';
import { formatRouteSummary, routeRecordProblems, type RouteRecord } from '../scripts/review-route-record.ts';
import { ruleDecision } from '../scripts/review-route-rules.ts';
import { featuresWith, QUIET_FEATURES } from './review-route-fake.ts';

// route.json against docs/review-findings/route.schema.json and the
// consistency rules of design.md "Route record".

const checkSchema = routeSchemaCheck(process.cwd());

const ANSWERED: ShadowDecision = {
  router: 'jev',
  status: 'answered',
  model: 'jev-1.14.0',
  tier: 'elevated',
  thirdPassProbability: 0.62,
  threshold: 0.4,
  passes: passPlans('elevated', QUIET_FEATURES),
  latencyMs: 250,
};

// The shape of archived records routed before the third pass question.
const LEGACY_ANSWERED: ShadowDecision = {
  router: 'jev',
  status: 'answered',
  model: 'jev-1.14.0',
  tier: 'elevated',
  confidence: 0.62,
  probabilities: { standard: 0.19, elevated: 0.81 },
  expectedPasses: 2.4,
  passes: passPlans('elevated', QUIET_FEATURES),
  latencyMs: 250,
};

function record(overrides: Partial<RouteRecord> = {}): RouteRecord {
  return {
    change: 'route-me',
    generatedAt: '2026-10-28T09:30:00.000Z',
    devCommit: 'a'.repeat(40),
    headCommit: 'b'.repeat(40),
    features: QUIET_FEATURES,
    rule: ruleDecision(QUIET_FEATURES),
    shadow: ANSWERED,
    ...overrides,
  };
}

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test('records with an answered, a legacy, a failed, and a skipped shadow are valid', () => {
  const failed: ShadowDecision = { router: 'jev', status: 'failed', reason: 'rate-limited', httpStatus: 429, latencyMs: 40 };
  for (const shadow of [ANSWERED, LEGACY_ANSWERED, failed, SKIPPED_SHADOW]) {
    assert.deepEqual(routeRecordProblems(roundTrip(record({ shadow })), 'route-me', checkSchema), []);
  }
});

test('an unknown property fails the schema without naming it', () => {
  const problems = routeRecordProblems({ ...record(), note: 'free text' }, 'route-me', checkSchema);
  assert.ok(problems.length > 0);
  assert.ok(problems.every((problem) => !problem.includes('note')));
});

test('free text in the shadow fails the schema', () => {
  const shadow = { router: 'jev', status: 'failed', reason: 'network', latencyMs: 1, message: 'connect ECONNREFUSED' };
  assert.ok(routeRecordProblems({ ...record(), shadow }, 'route-me', checkSchema).length > 0);
});

test('a probability above 1 fails the schema', () => {
  for (const shadow of [{ ...ANSWERED, thirdPassProbability: 1.5 }, { ...LEGACY_ANSWERED, probabilities: { standard: 0, elevated: 1.5 } }]) {
    assert.ok(routeRecordProblems(roundTrip(record({ shadow })), 'route-me', checkSchema).length > 0);
  }
});

test('an answer that mixes both question shapes fails the schema', () => {
  const shadow = { ...LEGACY_ANSWERED, thirdPassProbability: 0.62, threshold: 0.4 };
  assert.ok(routeRecordProblems(roundTrip(record({ shadow })), 'route-me', checkSchema).length > 0);
});

test('a shadow tier that its probability and threshold do not give is inconsistent', () => {
  const shadow = { ...ANSWERED, thirdPassProbability: 0.39 };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ shadow })), 'route-me', checkSchema), [
    'shadow tier elevated does not match P(third) 0.39 at threshold 0.4',
  ]);
  const standard = { ...ANSWERED, tier: 'standard' as const, thirdPassProbability: 0.4, passes: passPlans('standard', QUIET_FEATURES) };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ shadow: standard })), 'route-me', checkSchema), [
    'shadow tier standard does not match P(third) 0.4 at threshold 0.4',
  ]);
});

test('a standard tier with a fired trigger is inconsistent', () => {
  const rule = { ...ruleDecision(QUIET_FEATURES), triggers: ['lines' as const] };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ rule })), 'route-me', checkSchema), [
    'rule tier standard does not match 1 fired trigger(s)',
    'rule triggers are not those of rule version 3 for the features',
  ]);
});

test('rule triggers that the features do not fire are inconsistent', () => {
  const features = featuresWith({ linesChanged: 4099 });
  const rule = ruleDecision(QUIET_FEATURES);
  assert.deepEqual(routeRecordProblems(roundTrip(record({ features, rule })), 'route-me', checkSchema), [
    'rule triggers are not those of rule version 3 for the features',
  ]);
});

test('rule passes outside the reviewer table are inconsistent', () => {
  const rule = { ...ruleDecision(QUIET_FEATURES), passes: passPlans('elevated', QUIET_FEATURES) };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ rule })), 'route-me', checkSchema), [
    "rule passes are not the reviewer table's for tier standard",
  ]);
});

test('shadow passes outside the reviewer table are inconsistent', () => {
  const shadow = { ...ANSWERED, passes: passPlans('standard', QUIET_FEATURES) };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ shadow })), 'route-me', checkSchema), [
    "shadow passes are not the reviewer table's for tier elevated",
  ]);
});

test('a rule version without a reviewer table is reported', () => {
  const rule = { ...ruleDecision(QUIET_FEATURES), version: 4 };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ rule })), 'route-me', checkSchema), [
    'rule version 4 has no reviewer table',
  ]);
});

// Archived records of rule version 1 plan passes 1 and 2 only.
function versionOneRecord(passes = versionedPassPlans(1, 'standard', QUIET_FEATURES)!): RouteRecord {
  const shadow = { ...ANSWERED, tier: 'standard' as const, thirdPassProbability: 0.2, passes };
  return record({ rule: { ...ruleDecision(QUIET_FEATURES), version: 1, passes }, shadow });
}

test('a record of rule version 1 with two pass plans stays valid', () => {
  assert.deepEqual(routeRecordProblems(roundTrip(versionOneRecord()), 'route-me', checkSchema), []);
});

test('the pass plan count must match the rule version', () => {
  const threePasses = versionOneRecord(passPlans('standard', QUIET_FEATURES));
  assert.ok(routeRecordProblems(roundTrip(threePasses), 'route-me', checkSchema).length > 0);
  const twoPasses = versionedPassPlans(1, 'standard', QUIET_FEATURES)!;
  const versionTwo = record({ rule: { ...ruleDecision(QUIET_FEATURES), passes: twoPasses } });
  assert.ok(routeRecordProblems(roundTrip(versionTwo), 'route-me', checkSchema).length > 0);
});

test('a record of another change is reported', () => {
  assert.deepEqual(routeRecordProblems(roundTrip(record()), 'other-change', checkSchema), [
    'change "route-me" is not its directory\'s change "other-change"',
  ]);
});

test('a secret-like value is reported without printing it', () => {
  const secret = `sk-${'x'.repeat(24)}`;
  const problems = routeRecordProblems(roundTrip(record({ shadow: { ...ANSWERED, model: secret } })), 'route-me', checkSchema);
  assert.deepEqual(problems, ['1 value(s) look like a secret']);
});

test('the summary names the tier, triggers, plans, and the shadow agreement', () => {
  const elevated = featuresWith({ linesChanged: 420 });
  const summary = formatRouteSummary(record({ features: elevated, rule: ruleDecision(elevated) }));
  assert.match(summary, /^route: elevated \(lines\), rule version 3$/m);
  assert.match(summary, /^pass 1, reviewer A: codex gpt-6-astra#high$/m);
  assert.match(summary, /^pass 2, reviewer B: claude claude-fable-5-1#high$/m);
  assert.match(summary, /^pass 3, reviewer A: codex gpt-6\.1-sol#high, only after a pass 2 with a Medium or worse finding$/m);
  assert.match(summary, /^shadow: jev-1\.14\.0 elevated \(P\(third\) 0\.62, threshold 0\.4\), would assign codex gpt-6-astra#high, claude claude-fable-5-1#high, codex gpt-6\.1-sol#high; agrees with the rule$/m);
  const legacy = formatRouteSummary(record({ features: elevated, rule: ruleDecision(elevated), shadow: LEGACY_ANSWERED }));
  assert.match(legacy, /^shadow: jev-1\.14\.0 elevated \(0\.81\), would assign/m);
  assert.match(summary, /Recommendation only/);
});

test('the summary reports a disagreeing, a failed, and a skipped shadow', () => {
  assert.match(formatRouteSummary(record()), /^route: standard \(no trigger\)/m);
  assert.match(formatRouteSummary(record()), /disagrees with the rule$/m);
  const failed: ShadowDecision = { router: 'jev', status: 'failed', reason: 'timeout', latencyMs: 2000 };
  assert.match(formatRouteSummary(record({ shadow: failed })), /^shadow: failed \(timeout\); the rule decided alone$/m);
  assert.match(formatRouteSummary(record({ shadow: SKIPPED_SHADOW })), /^shadow: skipped$/m);
});
