import assert from 'node:assert/strict';
import test from 'node:test';
import { requestFailure } from '@taskelith/testing';

const URL_OF_CALL = new URL('http://127.0.0.1:8474/reset');

test('a network failure names the target, method, URL, and socket code', () => {
  const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
  const failure = requestFailure('Toxiproxy', 'POST', URL_OF_CALL, Date.now(), new TypeError('fetch failed', { cause: reset }));
  assert.match(failure.message, /^Toxiproxy POST http:\/\/127\.0\.0\.1:8474\/reset failed after \d+ ms: fetch failed \(ECONNRESET\)$/);
  assert.equal((failure.cause as Error).message, 'fetch failed');
});

test('a cause without a code is named by its message', () => {
  const failure = requestFailure('control plane', 'GET', URL_OF_CALL, Date.now(), new TypeError('fetch failed', { cause: new Error('other side closed') }));
  assert.match(failure.message, /: fetch failed \(other side closed\)$/);
});

test('an error without a cause, or a thrown value, is named as it is', () => {
  assert.match(requestFailure('Toxiproxy', 'GET', URL_OF_CALL, Date.now(), new Error('aborted')).message, /: aborted$/);
  assert.match(requestFailure('Toxiproxy', 'GET', URL_OF_CALL, Date.now(), 'refused').message, /: refused$/);
});
