export const COVERAGE_VARIABLE = 'NODE_V8_COVERAGE';

// A Node process killed while it writes its coverage file leaves it empty,
// which fails the run's report; spawn skips this key only when undefined.
export function uncoveredEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, [COVERAGE_VARIABLE]: undefined };
}

// For processes that product code spawns with a copy of process.env; this
// process keeps its own coverage, whose directory Node reads at start.
export function withholdCoverageFromDescendants(): void {
  delete process.env[COVERAGE_VARIABLE];
}
