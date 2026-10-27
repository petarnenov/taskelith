// A node killed while it writes its coverage file at exit leaves it empty,
// and the runner then fails the coverage report of the whole run.
export const COVERAGE_VARIABLE = 'NODE_V8_COVERAGE';

// spawn copies the variable from process.env unless env has the key, so it
// stays undefined, which spawn leaves out of the child's environment.
export function uncoveredEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, [COVERAGE_VARIABLE]: undefined };
}

// For processes that product code spawns with a copy of process.env; this
// process keeps its own coverage, whose directory Node reads at start.
export function withholdCoverageFromDescendants(): void {
  delete process.env[COVERAGE_VARIABLE];
}
