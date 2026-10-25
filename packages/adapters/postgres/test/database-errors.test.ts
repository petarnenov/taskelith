import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { StatementError } from '@taskelith/postgres';

function serverError(code: string): pg.DatabaseError {
  const error = new pg.DatabaseError('server error', 0, 'error');
  error.code = code;
  return error;
}

test('only a server error has an SQLSTATE; a socket code of the same shape is a lost connection', () => {
  const epipe = new StatementError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
  assert.equal(epipe.sqlState, undefined);
  assert.equal(epipe.isConnectionLoss, true);
  assert.equal(epipe.isRetryable, false);
  assert.equal(new StatementError(new Error('Connection terminated unexpectedly')).isConnectionLoss, true);
});

test('serialization failures and deadlocks are retryable, and statement errors are not lost connections', () => {
  for (const code of ['40001', '40P01']) assert.equal(new StatementError(serverError(code)).isRetryable, true, code);
  for (const code of ['08006', '57P01']) assert.equal(new StatementError(serverError(code)).isConnectionLoss, true, code);
  const unique = new StatementError(serverError('23505'));
  assert.deepEqual([unique.sqlState, unique.isRetryable, unique.isConnectionLoss], ['23505', false, false]);
  assert.equal(new StatementError('plain').message, 'plain');
});
