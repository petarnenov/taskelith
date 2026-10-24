import assert from 'node:assert/strict';
import test from 'node:test';
import { FAILURE_CODES, failure, isFailureCode } from '@taskelith/kernel';

test('failure codes are the stable vocabulary', () => {
  assert.deepEqual(FAILURE_CODES, [
    'invalid', 'not-found', 'conflict', 'precondition-failed', 'forbidden', 'unavailable', 'internal',
  ]);
});

test('failure is frozen and copies its details', () => {
  const details = { field: 'taskId' };
  const result = failure('conflict', 'Ownership generation changed', details);
  details.field = 'changed';
  assert.deepEqual(result, { code: 'conflict', message: 'Ownership generation changed', details: { field: 'taskId' } });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.details));
});

test('failure details default to empty', () => {
  assert.deepEqual(failure('internal', 'Unexpected state').details, {});
});

test('isFailureCode accepts only the vocabulary', () => {
  for (const code of FAILURE_CODES) assert.equal(isFailureCode(code), true);
  assert.equal(isFailureCode('timeout'), false);
  assert.equal(isFailureCode('INVALID'), false);
});
