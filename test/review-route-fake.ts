import type { ReviewRouter, RouteFeatures } from '../scripts/review-route.ts';

// Test doubles of the review route: a fixed-answer router and features.

export class FakeRouter<Decision> implements ReviewRouter<Decision> {
  readonly calls: RouteFeatures[] = [];
  readonly #decision: Decision;

  constructor(decision: Decision) {
    this.#decision = decision;
  }

  route(features: RouteFeatures): Promise<Decision> {
    this.calls.push(features);
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
