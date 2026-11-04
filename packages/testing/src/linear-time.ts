import assert from 'node:assert/strict';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

const RUN_LENGTH = 60_000;
// V8's regular expression stack overflows near 2^23 characters of one run,
// so the long run stays at 2^22 or below.
const MAX_RUN_LENGTH = 2 ** 22;
const LENGTH_RATIO = 4;
const SAMPLES = 5;
const NOISE_FLOOR_MS = 20;
const GROWTH_LIMIT = 2.5;

type Transform = (text: string) => unknown;

/** Runs the transform once on the run and returns its time in ms. */
export type RunTimer = (transform: Transform, run: string) => number;

export interface LinearTimeOptions {
  /** The length of each unit's long run before any doubling. */
  readonly length?: number;
  readonly timeRun?: RunTimer;
}

interface Runs {
  readonly short: string;
  readonly long: string;
}

interface RunTime {
  readonly length: number;
  readonly medianMs: number;
}

// Linear CPU time grows as fast as the run, quadratic time four times faster
// over a fourfold run, so a growth limit of 2.5 tells them apart.
export function assertLinearOnRuns(transform: Transform, units: readonly string[], { length = RUN_LENGTH, timeRun = threadCpuTime }: LinearTimeOptions = {}): void {
  for (const unit of units) {
    const [short, long] = timeUnit(transform, unit, length, timeRun);
    const growth = flooredRatio(short, long) / (long.length / short.length);
    assert.ok(growth < GROWTH_LIMIT, growthMessage(unit, short, long, growth));
  }
}

// The runs double until the short median reaches the floor on any host, or
// until doubling the long run would pass MAX_RUN_LENGTH characters.
function timeUnit(transform: Transform, unit: string, startLength: number, timeRun: RunTimer): [RunTime, RunTime] {
  for (let length = startLength; ; length *= 2) {
    const runs = unitRuns(unit, length);
    const canGrow = length * 2 <= MAX_RUN_LENGTH;
    if (canGrow && timeRun(transform, runs.short) < NOISE_FLOOR_MS) continue;
    const times = sampledTimes(transform, runs, timeRun);
    if (times[0].medianMs >= NOISE_FLOOR_MS || !canGrow) return times;
  }
}

function unitRuns(unit: string, length: number): Runs {
  return {
    short: unit.repeat(Math.ceil(length / LENGTH_RATIO / unit.length)),
    long: unit.repeat(Math.ceil(length / unit.length)),
  };
}

// Short and long samples alternate after one warm-up call, so that a pause
// in one sample leaves both medians.
function sampledTimes(transform: Transform, runs: Runs, timeRun: RunTimer): [RunTime, RunTime] {
  const shortSamples: number[] = [];
  const longSamples: number[] = [];
  transform(runs.short);
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    shortSamples.push(timeRun(transform, runs.short));
    longSamples.push(timeRun(transform, runs.long));
  }
  return [runTime(runs.short, shortSamples), runTime(runs.long, longSamples)];
}

// The thread's CPU time leaves out other processes of a loaded host and the
// collector's helper threads, which wall and process CPU time count.
function threadCpuTime(transform: Transform, run: string): number {
  assert.equal(typeof process.threadCpuUsage, 'function', 'assertLinearOnRuns needs Node.js 23.9 or later');
  collectGarbage();
  const started = process.threadCpuUsage();
  transform(run);
  const { user, system } = process.threadCpuUsage(started);
  return (user + system) / 1000;
}

let garbageCollector: (() => void) | undefined;

// node --test starts files without --expose-gc, so the first timing sets it;
// V8 then installs gc in a new context. Importing the module changes nothing.
function collectGarbage(): void {
  garbageCollector ??= exposedGarbageCollector();
  garbageCollector();
}

function exposedGarbageCollector(): () => void {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
}

function runTime(run: string, samples: readonly number[]): RunTime {
  const sorted = [...samples].sort((left, right) => left - right);
  return { length: run.length, medianMs: sorted[Math.floor(sorted.length / 2)]! };
}

// Under the floor, accounting and compilation make a ratio noise. Only the
// longest runs can stay under it, where quadratic work would take minutes.
function flooredRatio(short: RunTime, long: RunTime): number {
  return Math.max(long.medianMs, NOISE_FLOOR_MS) / Math.max(short.medianMs, NOISE_FLOOR_MS);
}

function growthMessage(unit: string, short: RunTime, long: RunTime, growth: number): string {
  const times = `${short.medianMs.toFixed(1)} ms at ${short.length} and ${long.medianMs.toFixed(1)} ms at ${long.length} characters`;
  return `${JSON.stringify(unit)} repeated grew ${growth.toFixed(1)} times faster than its length in CPU time: ${times}`;
}

