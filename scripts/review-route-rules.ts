import type { Size } from './checklist-record.ts';
import { passPlans, RULE_VERSION, TRIGGERS, type ReviewRouter, type RouteFeatures, type RuleDecision, type Trigger } from './review-route.ts';

// The rule router, the floor of the review route: deterministic triggers
// read off the archived review records (design.md "Rule table").

export { RULE_VERSION };

export const THRESHOLDS = {
  linesChanged: 400,
  filesChanged: 18,
  capabilities: 3,
} as const;

export const ELEVATED_SIZES: ReadonlySet<Size> = new Set<Size>(['M-L', 'L']);

const TRIGGER_CONDITIONS: Readonly<Record<Trigger, (features: RouteFeatures) => boolean>> = {
  lines: ({ linesChanged }) => linesChanged >= THRESHOLDS.linesChanged,
  files: ({ filesChanged }) => filesChanged >= THRESHOLDS.filesChanged,
  capabilities: ({ capabilities }) => capabilities.length >= THRESHOLDS.capabilities,
  security: ({ touches }) => touches.security,
  contracts: ({ touches }) => touches.contracts,
  docker: ({ touches }) => touches.docker,
  size: ({ size }) => size !== null && ELEVATED_SIZES.has(size),
};

// In the rule table's order, so equal features give equal decisions.
export function firedTriggers(features: RouteFeatures): Trigger[] {
  return TRIGGERS.filter((trigger) => TRIGGER_CONDITIONS[trigger](features));
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
