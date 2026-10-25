import assert from 'node:assert/strict';
import test from 'node:test';
import { SeededRandom, seededUuids, sequentialIds } from '@taskelith/testing';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('sequential identifiers count up from one under their prefix', () => {
  const ids = sequentialIds('ExecutionId', 'execution');
  assert.deepEqual([ids.next(), ids.next(), ids.next()], ['execution-1', 'execution-2', 'execution-3']);
});

test('an identifier that the kernel rejects fails loudly', () => {
  assert.throws(() => sequentialIds('ExecutionId', 'has space').next(), /ExecutionId must be/);
});

test('seeded identifiers are version 4 UUIDs that repeat for the same seed', () => {
  const first = seededUuids('OperationId', new SeededRandom(5));
  const second = seededUuids('OperationId', new SeededRandom(5));
  const values = [first.next(), first.next()];
  assert.deepEqual(values, [second.next(), second.next()]);
  assert.notEqual(values[0], values[1]);
  for (const value of values) assert.match(value, UUID_V4);
});
