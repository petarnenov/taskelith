import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_VARIABLE, SeededRandom, rerunHint, seedFromEnvironment } from '@taskelith/testing';

const draw = (random: SeededRandom, count: number) => Array.from({ length: count }, () => random.nextUint32());

test('one seed always yields the same sequence, and another seed a different one', () => {
  assert.deepEqual(draw(new SeededRandom(42), 5), draw(new SeededRandom(42), 5));
  assert.notDeepEqual(draw(new SeededRandom(42), 5), draw(new SeededRandom(43), 5));
  assert.deepEqual(draw(new SeededRandom(0), 3), [1144304738, 1416247, 958946056]);
});

test('nextInt stays below its bound and covers it', () => {
  const random = new SeededRandom(7);
  const seen = new Set(Array.from({ length: 200 }, () => random.nextInt(3)));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.equal(new SeededRandom(7).nextInt(1), 0);
  assert.ok(new SeededRandom(7).nextInt(2 ** 32) < 2 ** 32);
});

test('seeds and bounds outside the 32-bit range are rejected', () => {
  for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) assert.throws(() => new SeededRandom(seed), RangeError);
  for (const bound of [0, 1.5, 2 ** 32 + 1]) assert.throws(() => new SeededRandom(1).nextInt(bound), RangeError);
});

test('the environment names the seed of a rerun, and a missing seed is fresh', () => {
  assert.equal(seedFromEnvironment({ [SEED_VARIABLE]: '1234' }), 1234);
  assert.equal(seedFromEnvironment({ [SEED_VARIABLE]: '0' }), 0);
  for (const env of [{}, { [SEED_VARIABLE]: '' }]) {
    const seed = seedFromEnvironment(env);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
  }
  for (const text of ['-1', '1e3', 'abc', ' 5', String(2 ** 32)]) {
    assert.throws(() => seedFromEnvironment({ [SEED_VARIABLE]: text }), RangeError, text);
  }
});

test('the rerun hint names the variable and the seed', () => {
  assert.equal(rerunHint(99), `rerun with ${SEED_VARIABLE}=99`);
});
