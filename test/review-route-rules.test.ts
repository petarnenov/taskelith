import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewerKey } from '../scripts/review-findings.ts';
import { passPlans, versionedPassPlans, type RouteFeatures, type Tier, type Trigger } from '../scripts/review-route.ts';
import { firedTriggers, RULE_VERSION, ruleDecision, RuleRouter, versionedTriggers } from '../scripts/review-route-rules.ts';
import { featuresWith, QUIET_FEATURES, touching } from './review-route-fake.ts';

// The rule router against design.md "Rule table", row by row.

const planKeys = (tier: Tier, externalFacts: boolean) => passPlans(tier, { externalFacts }).map(({ reviewer }) => reviewerKey(reviewer));

// Fails before the change: rule version 1 planned passes 1 and 2 only.
test('the reviewer table of rule version 2 plans the review sequence', () => {
  assert.equal(RULE_VERSION, 2);
  assert.deepEqual(planKeys('standard', false), ['codex gpt-6-astra#medium', 'claude claude-opus-5-5#medium', 'codex gpt-6.1-sol#medium']);
  assert.deepEqual(planKeys('standard', true), ['claude claude-fable-5-1#medium', 'claude claude-opus-5-5#medium', 'claude claude-fable-5-1#medium']);
  assert.deepEqual(planKeys('elevated', false), ['codex gpt-6-astra#high', 'claude claude-opus-5-5#xhigh', 'codex gpt-6.1-sol#high']);
  assert.deepEqual(planKeys('elevated', true), ['claude claude-fable-5-1#high', 'claude claude-opus-5-5#xhigh', 'claude claude-fable-5-1#high']);
});

test('the current plans are those of the current rule version', () => {
  for (const tier of ['standard', 'elevated'] as const) {
    for (const externalFacts of [false, true]) {
      assert.deepEqual(versionedPassPlans(RULE_VERSION, tier, { externalFacts }), passPlans(tier, { externalFacts }));
    }
  }
});

test('rule version 1 keeps its reviewer table', () => {
  const keysOf = (tier: Tier, externalFacts: boolean) =>
    versionedPassPlans(1, tier, { externalFacts })!.map(({ reviewer }) => reviewerKey(reviewer));
  assert.deepEqual(keysOf('standard', false), ['codex gpt-6.1-sol#medium', 'claude claude-opus-5-5#high']);
  assert.deepEqual(keysOf('standard', true), ['claude claude-fable-5-1#medium', 'claude claude-opus-5-5#high']);
  assert.deepEqual(keysOf('elevated', false), ['codex gpt-6.1-sol#high', 'claude claude-opus-5-5#xhigh']);
  assert.deepEqual(keysOf('elevated', true), ['claude claude-fable-5-1#high', 'claude claude-opus-5-5#xhigh']);
  assert.equal(versionedPassPlans(0, 'standard', { externalFacts: false }), undefined);
});

test('rule versions 1 and 2 share the thresholds', () => {
  assert.deepEqual(versionedTriggers(2, featuresWith({ linesChanged: 400, size: 'M-L' })), ['lines', 'size']);
  assert.deepEqual(versionedTriggers(1, featuresWith({ linesChanged: 400, size: 'M-L' })), ['lines', 'size']);
  assert.deepEqual(versionedTriggers(1, featuresWith({ linesChanged: 399 })), []);
  assert.equal(versionedTriggers(0, QUIET_FEATURES), undefined);
});

test('pass plans name passes 1 and 3 role A and pass 2 role B', () => {
  const plans = passPlans('standard', { externalFacts: false });
  assert.deepEqual(plans.map(({ pass, role }) => [pass, role]), [[1, 'A'], [2, 'B'], [3, 'A']]);
});

const BOUNDARIES: readonly { name: string; below: RouteFeatures; at: RouteFeatures; trigger: Trigger }[] = [
  { name: '399 and 400 lines', below: featuresWith({ linesChanged: 399 }), at: featuresWith({ linesChanged: 400 }), trigger: 'lines' },
  { name: '17 and 18 files', below: featuresWith({ filesChanged: 17 }), at: featuresWith({ filesChanged: 18 }), trigger: 'files' },
  {
    name: '2 and 3 capabilities',
    below: featuresWith({ capabilities: ['a', 'b'] }),
    at: featuresWith({ capabilities: ['a', 'b', 'c'] }),
    trigger: 'capabilities',
  },
  { name: 'size M and M-L', below: featuresWith({ size: 'M' }), at: featuresWith({ size: 'M-L' }), trigger: 'size' },
];

for (const { name, below, at, trigger } of BOUNDARIES) {
  test(`the ${trigger} trigger fires at the threshold: ${name}`, () => {
    assert.deepEqual(ruleDecision(below).triggers, []);
    assert.equal(ruleDecision(below).tier, 'standard');
    assert.deepEqual(ruleDecision(at).triggers, [trigger]);
    assert.equal(ruleDecision(at).tier, 'elevated');
  });
}

const FLAG_TRIGGERS: readonly { trigger: Trigger; features: RouteFeatures }[] = [
  { trigger: 'security', features: touching({ security: true }) },
  { trigger: 'contracts', features: touching({ contracts: true }) },
  { trigger: 'docker', features: touching({ docker: true }) },
  { trigger: 'size', features: featuresWith({ size: 'L' }) },
];

for (const { trigger, features } of FLAG_TRIGGERS) {
  test(`the ${trigger} trigger alone elevates the tier`, () => {
    assert.deepEqual(ruleDecision(features).triggers, [trigger]);
    assert.equal(ruleDecision(features).tier, 'elevated');
  });
}

test('flags that are no trigger leave the tier standard', () => {
  const features = featuresWith({
    size: null,
    touches: { code: true, tests: true, contracts: false, specs: true, docker: false, security: false, docsOnly: true },
    capabilityHistory: { changes: 9, thirdPassShare: 1, mediumOrWorsePerChange: 9 },
  });
  assert.deepEqual(ruleDecision(features), {
    version: RULE_VERSION,
    tier: 'standard',
    triggers: [],
    passes: passPlans('standard', features),
  });
});

test('every fired trigger is listed in the rule table order', () => {
  const features = featuresWith({
    linesChanged: 900,
    filesChanged: 30,
    capabilities: ['a', 'b', 'c'],
    touches: { ...QUIET_FEATURES.touches, security: true, contracts: true, docker: true },
    size: 'L',
  });
  assert.deepEqual(firedTriggers(features), ['lines', 'files', 'capabilities', 'security', 'contracts', 'docker', 'size']);
});

test('a large change without external facts gets the elevated Codex plan', async () => {
  const decision = await new RuleRouter().route(featuresWith({ linesChanged: 420, filesChanged: 6 }));
  assert.equal(decision.tier, 'elevated');
  assert.deepEqual(decision.triggers, ['lines']);
  assert.deepEqual(decision.passes.map(({ reviewer }) => reviewerKey(reviewer)), ['codex gpt-6-astra#high', 'claude claude-opus-5-5#xhigh', 'codex gpt-6.1-sol#high']);
});

test('a small change with external facts gets the standard Fable plan', async () => {
  const decision = await new RuleRouter().route(featuresWith({ externalFacts: true }));
  assert.equal(decision.tier, 'standard');
  assert.deepEqual(decision.passes.map(({ reviewer }) => reviewerKey(reviewer)), ['claude claude-fable-5-1#medium', 'claude claude-opus-5-5#medium', 'claude claude-fable-5-1#medium']);
});

test('the same features give equal decisions', async () => {
  const router = new RuleRouter();
  const features = featuresWith({ linesChanged: 500 });
  assert.deepEqual(await router.route(features), await router.route({ ...features }));
});
