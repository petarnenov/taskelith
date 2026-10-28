import assert from 'node:assert/strict';
import test from 'node:test';
import { passPlans, SKIPPED_SHADOW, type ShadowDecision } from '../scripts/review-route.ts';
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

test('records with an answered, a failed, and a skipped shadow are valid', () => {
  const failed: ShadowDecision = { router: 'jev', status: 'failed', reason: 'rate-limited', httpStatus: 429, latencyMs: 40 };
  for (const shadow of [ANSWERED, failed, SKIPPED_SHADOW]) {
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
  const shadow = { ...ANSWERED, probabilities: { standard: 0, elevated: 1.5 } };
  assert.ok(routeRecordProblems(roundTrip(record({ shadow })), 'route-me', checkSchema).length > 0);
});

test('a standard tier with a fired trigger is inconsistent', () => {
  const rule = { ...ruleDecision(QUIET_FEATURES), triggers: ['lines' as const] };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ rule })), 'route-me', checkSchema), [
    'rule tier standard does not match 1 fired trigger(s)',
    'rule triggers are not those of rule version 1 for the features',
  ]);
});

test('rule triggers that the features do not fire are inconsistent', () => {
  const features = featuresWith({ linesChanged: 4099 });
  const rule = ruleDecision(QUIET_FEATURES);
  assert.deepEqual(routeRecordProblems(roundTrip(record({ features, rule })), 'route-me', checkSchema), [
    'rule triggers are not those of rule version 1 for the features',
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
  const rule = { ...ruleDecision(QUIET_FEATURES), version: 2 };
  assert.deepEqual(routeRecordProblems(roundTrip(record({ rule })), 'route-me', checkSchema), [
    'rule version 2 has no reviewer table',
  ]);
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
  assert.match(summary, /^route: elevated \(lines\), rule version 1$/m);
  assert.match(summary, /^pass 1, reviewer A: codex gpt-6\.1-sol#high$/m);
  assert.match(summary, /^pass 2, reviewer B: claude claude-opus-5-5#xhigh$/m);
  assert.match(summary, /^shadow: jev-1\.14\.0 elevated \(0\.81\), would assign codex gpt-6\.1-sol#high, claude claude-opus-5-5#xhigh; agrees with the rule$/m);
  assert.match(summary, /Recommendation only/);
});

test('the summary reports a disagreeing, a failed, and a skipped shadow', () => {
  assert.match(formatRouteSummary(record()), /^route: standard \(no trigger\)/m);
  assert.match(formatRouteSummary(record()), /disagrees with the rule$/m);
  const failed: ShadowDecision = { router: 'jev', status: 'failed', reason: 'timeout', latencyMs: 2000 };
  assert.match(formatRouteSummary(record({ shadow: failed })), /^shadow: failed \(timeout\); the rule decided alone$/m);
  assert.match(formatRouteSummary(record({ shadow: SKIPPED_SHADOW })), /^shadow: skipped$/m);
});
