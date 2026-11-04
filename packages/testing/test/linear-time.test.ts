import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLinearOnRuns } from '@taskelith/testing';

const RUN_LENGTH = 60_000;

function busyWait(milliseconds: number): void {
  const end = performance.now() + milliseconds;
  while (performance.now() < end);
}

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

test('a linear transform gets a short and a long run of every unit', () => {
  const seen = new Set<string>();
  assertLinearOnRuns((run) => seen.add(run), ['a.', 'abc'], 12);
  assert.deepEqual([...seen], ['a.a.', 'a.'.repeat(6), 'abc', 'abc'.repeat(4)]);
});

test('a pause in one sample, as a garbage collection causes, passes', () => {
  let paused = false;
  const pausedOnce = (run: string) => {
    if (paused || run.length < RUN_LENGTH) return;
    paused = true;
    busyWait(300);
  };
  assertLinearOnRuns(pausedOnce, ['a.']);
  assert.ok(paused);
});

test('a quadratic redactor fails, naming its unit and its times', () => {
  assert.throws(() => assertLinearOnRuns(quadraticRedact, ['a b'], 16_000), {
    name: 'AssertionError',
    message: /^"a b" repeated grew \d+\.\d times faster than its length in CPU time: [\d.]+ ms at 4002 and [\d.]+ ms at 16002 characters$/,
  });
});
