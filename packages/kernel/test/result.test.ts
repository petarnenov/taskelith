import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok } from '@taskelith/kernel';

test('ok carries a value and err carries an error', () => {
  assert.deepEqual(ok(42), { ok: true, value: 42 });
  const error = failure('not-found', 'Task not found');
  assert.deepEqual(err(error), { ok: false, error });
});
