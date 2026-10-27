import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLinearOnRuns } from '@taskelith/testing';

test('a transform that is quick on every run passes', () => {
  const seen: number[] = [];
  assertLinearOnRuns((run) => seen.push(run.length), ['a.', 'abc'], 10);
  assert.deepEqual(seen, [10, 12]);
});

test('a transform that is slow on a run fails, naming its unit', () => {
  const slow = () => {
    const end = performance.now() + 250;
    while (performance.now() < end);
  };
  assert.throws(() => assertLinearOnRuns(slow, ['a.']), /"a\." repeated took \d+ ms/);
});
