import assert from 'node:assert/strict';

const RUN_LENGTH = 60_000;
const LIMIT_MS = 200;

// A run of one repeated unit makes a quadratic pattern take seconds, while
// a linear one takes milliseconds, so the 200 ms limit tells them apart.
export function assertLinearOnRuns(transform: (text: string) => unknown, units: readonly string[], length = RUN_LENGTH): void {
  for (const unit of units) {
    const run = unit.repeat(Math.ceil(length / unit.length));
    const started = performance.now();
    transform(run);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < LIMIT_MS, `${JSON.stringify(unit)} repeated took ${Math.round(elapsed)} ms`);
  }
}
