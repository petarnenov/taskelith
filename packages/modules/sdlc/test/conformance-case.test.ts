import assert from 'node:assert/strict';
import test from 'node:test';
import { isJsonObject, isSameData } from '@taskelith/sdlc';

test('data equality treats undefined fields as absent but compares values exactly', () => {
  assert.equal(isSameData({ a: 1, b: undefined }, { a: 1 }), true);
  assert.equal(isSameData({ a: Number.NaN }, { a: null }), false);
  assert.equal(isSameData([1, 2], [1, 2]), true);
  assert.equal(isSameData([1], [1, 2]), false);
  assert.equal(isSameData({ a: [1] }, { a: { 0: 1 } }), false);
  assert.equal(isSameData('a', 'a'), true);
});

test('array holes are compared in both directions', () => {
  const hole = [, 2];
  assert.equal(isSameData(hole, [42, 2]), false);
  assert.equal(isSameData([42, 2], hole), false);
  assert.equal(isSameData(hole, [undefined, 2]), false);
});

test('JSON objects are dense, acyclic, finite, and without -0', () => {
  assert.equal(isJsonObject({ a: [1, 'x', true, null, { b: 0 }] }), true);
  const shared = { leaf: 1 };
  assert.equal(isJsonObject({ left: shared, right: shared }), true);
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const value of [[], null, 'text', { a: -0 }, { a: new Array(2) }, cycle, { a: new Map() }, Object.create({})]) {
    assert.equal(isJsonObject(value), false, String(value));
  }
});
