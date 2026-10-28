import {
  passPlans,
  RULE_VERSION,
  triggerThresholds,
  TRIGGERS,
  type ReviewRouter,
  type RouteFeatures,
  type RuleDecision,
  type Trigger,
  type TriggerThresholds,
} from './review-route.ts';

// The rule router, the floor of the review route: deterministic triggers
// read off the archived review records (design.md "Rule table").

export { RULE_VERSION };

type TriggerCondition = (features: RouteFeatures, thresholds: TriggerThresholds) => boolean;

const TRIGGER_CONDITIONS: Readonly<Record<Trigger, TriggerCondition>> = {
  lines: ({ linesChanged }, thresholds) => linesChanged >= thresholds.linesChanged,
  files: ({ filesChanged }, thresholds) => filesChanged >= thresholds.filesChanged,
  capabilities: ({ capabilities }, thresholds) => capabilities.length >= thresholds.capabilities,
  security: ({ touches }) => touches.security,
  contracts: ({ touches }) => touches.contracts,
  docker: ({ touches }) => touches.docker,
  size: ({ size }, thresholds) => size !== null && thresholds.elevatedSizes.includes(size),
};

// The triggers of the current rule version.
export function firedTriggers(features: RouteFeatures): Trigger[] {
  return triggersOf(features, triggerThresholds(RULE_VERSION)!);
}

// The triggers of the given rule version; undefined for an unknown one.
export function versionedTriggers(version: number, features: RouteFeatures): Trigger[] | undefined {
  const thresholds = triggerThresholds(version);
  return thresholds === undefined ? undefined : triggersOf(features, thresholds);
}

// In the rule table's order, so equal features give equal decisions.
function triggersOf(features: RouteFeatures, thresholds: TriggerThresholds): Trigger[] {
  return TRIGGERS.filter((trigger) => TRIGGER_CONDITIONS[trigger](features, thresholds));
}

export function ruleDecision(features: RouteFeatures): RuleDecision {
  const triggers = firedTriggers(features);
  const tier = triggers.length > 0 ? 'elevated' : 'standard';
  return { version: RULE_VERSION, tier, triggers, passes: passPlans(tier, features) };
}

export class RuleRouter implements ReviewRouter<RuleDecision> {
  route(features: RouteFeatures): Promise<RuleDecision> {
    return Promise.resolve(ruleDecision(features));
  }
}
