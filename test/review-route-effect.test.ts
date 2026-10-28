import assert from 'node:assert/strict';
import test from 'node:test';
import { passPlans, SKIPPED_SHADOW, type ShadowDecision, type Tier } from '../scripts/review-route.ts';
import {
  agreement,
  formatOutcomeFigures,
  formatRoutingFigures,
  NO_FINDINGS,
  outcomeFigures,
  routingFigures,
  type ReviewOutcome,
  type RoutedChange,
} from '../scripts/review-route-effect.ts';

// Routing figures over hand-computed outcomes and shadow answers.

function outcome(passesNeeded: number, overrides: Partial<ReviewOutcome> = {}): ReviewOutcome {
  return {
    passesNeeded,
    thirdPass: passesNeeded >= 3,
    passSummaries: true,
    findings: { pass1: NO_FINDINGS, pass2: NO_FINDINGS },
    ...overrides,
  };
}

function answered(tier: Tier, elevated: number, expectedPasses: number): ShadowDecision {
  return {
    router: 'jev',
    status: 'answered',
    model: 'jev-1.14.0',
    tier,
    confidence: 0.8,
    probabilities: { standard: 1 - elevated, elevated },
    expectedPasses,
    passes: passPlans(tier, { externalFacts: false }),
    latencyMs: 5,
  };
}

function routed(rule: Tier, shadow: ShadowDecision, result: ReviewOutcome): RoutedChange {
  return { change: `change-${rule}`, rule, shadow, outcome: result };
}

test('outcome figures count third passes, passes, and findings', () => {
  const figures = outcomeFigures([
    outcome(3, { findings: { pass1: { critical: 1, high: 1, medium: 1, low: 1 }, pass2: { ...NO_FINDINGS, medium: 2 } } }),
    outcome(1, { findings: { pass1: { ...NO_FINDINGS, low: 2 }, pass2: NO_FINDINGS } }),
  ]);
  assert.deepEqual(figures, {
    changes: 2,
    thirdPasses: 1,
    thirdPassShare: 0.5,
    meanPasses: 2,
    passOneFindingsPerChange: 3,
    mediumOrWorsePerChange: 2.5,
  });
});

test('outcome figures of no change are null, not zero', () => {
  assert.deepEqual(outcomeFigures([]), {
    changes: 0,
    thirdPasses: 0,
    thirdPassShare: null,
    meanPasses: null,
    passOneFindingsPerChange: null,
    mediumOrWorsePerChange: null,
  });
});

test('the rule figures split the outcomes by the rule tier', () => {
  const figures = routingFigures([
    routed('elevated', SKIPPED_SHADOW, outcome(3)),
    routed('elevated', SKIPPED_SHADOW, outcome(2)),
    routed('standard', SKIPPED_SHADOW, outcome(1)),
  ]);
  assert.equal(figures.all.changes, 3);
  assert.equal(figures.rule.elevated.thirdPassShare, 0.5);
  assert.equal(figures.rule.standard.thirdPassShare, 0);
  assert.equal(figures.shadow.skipped, 3);
  assert.equal(figures.shadow.answered, 0);
  assert.deepEqual(figures.shadow.agreement, { changes: 0, agreeing: 0, share: null, kappa: null });
  assert.equal(figures.shadow.brierScore, null);
  assert.equal(figures.shadow.passesMeanAbsoluteError, null);
});

test('answered shadows give agreement, kappa, Brier score, and pass error', () => {
  const figures = routingFigures([
    routed('elevated', answered('elevated', 0.9, 3), outcome(3)),
    routed('elevated', answered('standard', 0.4, 2), outcome(2)),
    routed('standard', answered('standard', 0.2, 1), outcome(1)),
    routed('standard', answered('standard', 0.1, 1.5), outcome(3)),
    routed('standard', { router: 'jev', status: 'failed', reason: 'timeout', latencyMs: 2000 }, outcome(1)),
  ]);
  const { shadow } = figures;
  assert.equal(shadow.answered, 4);
  assert.deepEqual(shadow.failed, { timeout: 1 });
  // Agreement 3 of 4; chance 0.5 * 0.25 + 0.5 * 0.75 = 0.5.
  assert.deepEqual(shadow.agreement, { changes: 4, agreeing: 3, share: 0.75, kappa: 0.5 });
  // (0.01 + 0.16 + 0.04 + 0.81) / 4 and (0 + 0 + 0 + 1.5) / 4.
  assert.equal(shadow.brierScore, 0.255);
  assert.equal(shadow.passesMeanAbsoluteError, 0.375);
  assert.equal(shadow.tiers.standard.changes, 3);
  assert.equal(shadow.tiers.elevated.thirdPassShare, 1);
});

test('kappa is null when both routers always name the same tier', () => {
  const same = [routed('standard', answered('standard', 0.1, 1), outcome(1))];
  const answers = same as Parameters<typeof agreement>[0];
  assert.deepEqual(agreement(answers), { changes: 1, agreeing: 1, share: 1, kappa: null });
});

test('the figures print per tier, with the shadow when it answered', () => {
  assert.equal(
    formatOutcomeFigures('All', outcomeFigures([outcome(3)])),
    'All: 1 change(s), third pass 1 (100%), mean passes 3.00, pass-1 findings per change 0.00, medium or worse in passes 1-2 per change 0.00',
  );
  assert.match(formatOutcomeFigures('None', outcomeFigures([])), /third pass 0 \(n\/a\), mean passes n\/a/);
  const ruleOnly = formatRoutingFigures(routingFigures([routed('standard', SKIPPED_SHADOW, outcome(1))]));
  assert.equal(ruleOnly.at(-1), '  shadow: no answer (answered 0, failed 0, skipped 1)');
  const withShadow = formatRoutingFigures(routingFigures([
    routed('elevated', answered('elevated', 0.9, 3), outcome(3)),
    routed('standard', { router: 'jev', status: 'failed', reason: 'network', latencyMs: 3 }, outcome(1)),
  ]));
  assert.equal(withShadow.length, 6);
  assert.equal(withShadow[4], '  shadow: answered 1, failed network 1, skipped 0; agreement 1 of 1 (100%), kappa n/a');
  assert.equal(withShadow[5], '  shadow: Brier score of P(elevated) 0.01, mean absolute error of passes 0.00');
});
