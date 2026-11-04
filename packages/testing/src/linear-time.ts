import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

const RUN_LENGTH = 60_000;
const SHORT_RUN_SHARE = 4;
const SAMPLES = 5;
const NOISE_FLOOR_MS = 20;
const GROWTH_LIMIT = 2.5;

// node --test starts each file without --expose-gc, so the flag is set here
// and gc is taken from a fresh context, where V8 then installs it.
setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

interface RunTime {
  readonly length: number;
  readonly medianMs: number;
}

// Linear CPU time grows as fast as the run, quadratic time four times faster
// over a fourfold run, so a growth limit of 2.5 tells them apart.
export function assertLinearOnRuns(transform: (text: string) => unknown, units: readonly string[], length = RUN_LENGTH): void {
  for (const unit of units) {
    const [short, long] = timeRuns(transform, unit, length);
    const growth = timeRatio(short, long) / (long.length / short.length);
    assert.ok(growth < GROWTH_LIMIT, growthMessage(unit, short, long, growth));
  }
}

// Short and long samples alternate after a forced collection each, so that
// a pause in one sample leaves both medians.
function timeRuns(transform: (text: string) => unknown, unit: string, length: number): [RunTime, RunTime] {
  const short = unit.repeat(Math.ceil(length / SHORT_RUN_SHARE / unit.length));
  const long = unit.repeat(Math.ceil(length / unit.length));
  const shortSamples: number[] = [];
  const longSamples: number[] = [];
  transform(short);
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    shortSamples.push(cpuTime(transform, short));
    longSamples.push(cpuTime(transform, long));
  }
  return [runTime(short, shortSamples), runTime(long, longSamples)];
}

// The thread's CPU time leaves out other processes of a loaded host and the
// collector's helper threads, which wall and process CPU time count.
function cpuTime(transform: (text: string) => unknown, run: string): number {
  collectGarbage();
  const started = process.threadCpuUsage();
  transform(run);
  const { user, system } = process.threadCpuUsage(started);
  return (user + system) / 1000;
}

function runTime(run: string, samples: readonly number[]): RunTime {
  const sorted = [...samples].sort((left, right) => left - right);
  return { length: run.length, medianMs: sorted[Math.floor(sorted.length / 2)]! };
}

// Below the floor, accounting and compilation make the ratio noise, so a
// long run under 4 x 2.5 x 20 = 200 ms of CPU time always passes.
function timeRatio(short: RunTime, long: RunTime): number {
  return Math.max(long.medianMs, NOISE_FLOOR_MS) / Math.max(short.medianMs, NOISE_FLOOR_MS);
}

function growthMessage(unit: string, short: RunTime, long: RunTime, growth: number): string {
  const times = `${short.medianMs.toFixed(1)} ms at ${short.length} and ${long.medianMs.toFixed(1)} ms at ${long.length} characters`;
  return `${JSON.stringify(unit)} repeated grew ${growth.toFixed(1)} times faster than its length in CPU time: ${times}`;
}
