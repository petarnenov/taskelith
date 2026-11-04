import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLinearOnRuns, type RunTimer } from '@taskelith/testing';

const REVEALED = 'ab';

// Searches the rest of the text for the revealed value from every position,
// as a naive redactor would; the run `a b` never holds it.
function quadraticRedact(text: string): string {
  let redacted = '';
  for (let index = 0; index < text.length; index += 1) {
    redacted += text.indexOf(REVEALED, index) === index ? '*' : text[index];
  }
  return redacted;
}

function timesPerCharacter(milliseconds: number, runs: string[] = []): RunTimer {
  return (transform, run) => {
    transform(run);
    runs.push(run);
    return run.length * milliseconds;
  };
}

function scriptedTimer(readings: readonly number[], runs: string[] = []): RunTimer {
  const pending = [...readings];
  return (_transform, run) => {
    runs.push(run);
    const reading = pending.shift();
    assert.ok(reading !== undefined, 'the timer ran out of readings');
    return reading;
  };
}

const fiveTimes = (reading: number) => Array<number>(5).fill(reading);

function alternate(shorts: readonly number[], longs: readonly number[]): number[] {
  return shorts.flatMap((short, sample) => [short, longs[sample]!]);
}

// One reading sizes the runs, then five short and long samples alternate.
function sampleReadings(short: number, longs: readonly number[]): number[] {
  return [short, ...alternate(fiveTimes(short), longs)];
}

test('a linear transform gets a short and a long run of every unit', () => {
  const seen = new Set<string>();
  assertLinearOnRuns((run) => seen.add(run), ['a.', 'abc'], 12, timesPerCharacter(10));
  assert.deepEqual([...seen], ['a.a.', 'a.'.repeat(6), 'abc', 'abc'.repeat(4)]);
});

test('runs double until the short run takes the 20 ms floor', () => {
  const runs: string[] = [];
  assertLinearOnRuns(() => undefined, ['a'], 4_000, timesPerCharacter(0.001, runs));
  assert.deepEqual([...new Set(runs.map((run) => run.length))], [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 128_000]);
});

test('a short median under the floor doubles the runs again', () => {
  const readings = [25, ...alternate([15, 15, 15, 25, 25], fiveTimes(60)), ...sampleReadings(30, fiveTimes(120))];
  const runs: string[] = [];
  assertLinearOnRuns(() => undefined, ['a'], 4_000, scriptedTimer(readings, runs));
  assert.deepEqual([runs.length, runs.at(-1)?.length], [22, 8_000]);
});

// The longest runs take no reading to size them.
const longestRunReadings = (long: number) => alternate(fiveTimes(1), fiveTimes(long));

test('on the longest runs, medians under the floor count as the floor', () => {
  assertLinearOnRuns(() => undefined, ['a'], 2 ** 24, scriptedTimer(longestRunReadings(79)));
});

test('on the longest runs, a long median of ten floors fails', () => {
  assert.throws(() => assertLinearOnRuns(() => undefined, ['a'], 2 ** 24, scriptedTimer(longestRunReadings(200))), {
    name: 'AssertionError',
    message: '"a" repeated grew 2.5 times faster than its length in CPU time: 1.0 ms at 4194304 and 200.0 ms at 16777216 characters',
  });
});

test('growth just under 2.5 times the length passes', () => {
  assertLinearOnRuns(() => undefined, ['a'], 4_000, scriptedTimer(sampleReadings(20, fiveTimes(199.9))));
});

test('growth of 2.5 times the length fails at the floor', () => {
  assert.throws(() => assertLinearOnRuns(() => undefined, ['a'], 4_000, scriptedTimer(sampleReadings(20, fiveTimes(200)))), {
    name: 'AssertionError',
    message: '"a" repeated grew 2.5 times faster than its length in CPU time: 20.0 ms at 1000 and 200.0 ms at 4000 characters',
  });
});

test('quadratic readings above the floor fail', () => {
  assert.throws(() => assertLinearOnRuns(() => undefined, ['a'], 4_000, scriptedTimer(sampleReadings(25, fiveTimes(400)))), {
    name: 'AssertionError',
    message: '"a" repeated grew 4.0 times faster than its length in CPU time: 25.0 ms at 1000 and 400.0 ms at 4000 characters',
  });
});

test('a pause in one sample, as a garbage collection causes, passes', () => {
  assertLinearOnRuns(() => undefined, ['a'], 4_000, scriptedTimer(sampleReadings(30, [420, 120, 120, 120, 120])));
});

test('a quadratic redactor fails on runs sized to the host, naming its unit and times', () => {
  assert.throws(() => assertLinearOnRuns(quadraticRedact, ['a b'], 1_000), {
    name: 'AssertionError',
    message: /^"a b" repeated grew \d+\.\d times faster than its length in CPU time: [\d.]+ ms at \d+ and [\d.]+ ms at \d+ characters$/,
  });
});
