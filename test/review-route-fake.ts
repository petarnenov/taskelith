import type { ReviewRouter, RouteFeatures, ShadowInput } from '../scripts/review-route.ts';

// Test doubles of the review route: a fixed-answer router and features.

export class FakeRouter<Decision, Input = RouteFeatures> implements ReviewRouter<Decision, Input> {
  readonly calls: Input[] = [];
  readonly #decision: Decision;

  constructor(decision: Decision) {
    this.#decision = decision;
  }

  route(input: Input): Promise<Decision> {
    this.calls.push(input);
    return Promise.resolve(this.#decision);
  }
}

export const QUIET_FEATURES: RouteFeatures = {
  linesChanged: 40,
  filesChanged: 3,
  capabilities: ['review-process'],
  touches: { code: true, tests: true, contracts: false, specs: true, docker: false, security: false, docsOnly: false },
  externalFacts: false,
  size: 'M',
  capabilityHistory: { changes: 4, thirdPassShare: 0.25, mediumOrWorsePerChange: 1.5 },
};

export function featuresWith(overrides: Partial<RouteFeatures>): RouteFeatures {
  return { ...QUIET_FEATURES, ...overrides };
}

export function touching(touches: Partial<RouteFeatures['touches']>): RouteFeatures {
  return featuresWith({ touches: { ...QUIET_FEATURES.touches, ...touches } });
}

export const QUIET_INPUT: ShadowInput = {
  features: QUIET_FEATURES,
  reference: {
    changes: 50,
    thirdPassShare: 0.32,
    byLinesChanged: [
      { band: 'under 100 lines', changes: 20, thirdPassShare: 0.1 },
      { band: '100 to 399 lines', changes: 15, thirdPassShare: 0.4 },
      { band: '400 lines and more', changes: 15, thirdPassShare: 0.6 },
    ],
  },
  content: { why: 'The request is badly shaped.', whatChanges: '- One question.', taskCount: 9, specRequirementCount: 3 },
};

export function inputWith(features: Partial<RouteFeatures>): ShadowInput {
  return { ...QUIET_INPUT, features: featuresWith(features) };
}
