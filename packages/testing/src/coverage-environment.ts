export const COVERAGE_VARIABLE = 'NODE_V8_COVERAGE';

// A node killed while it writes its coverage file at exit leaves it empty,
// and the runner then fails the coverage report of the whole run.
export function uncoveredEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { [COVERAGE_VARIABLE]: _uncovered, ...environment } = base;
  return environment;
}

// For processes that product code spawns with a copy of process.env; this
// process keeps its own coverage, whose directory Node reads at start.
export function withholdCoverageFromDescendants(): void {
  delete process.env[COVERAGE_VARIABLE];
}
