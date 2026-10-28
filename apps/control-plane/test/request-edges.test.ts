import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { SESSION_COOKIE, readStandardInputLine, requestLogFields, sessionCookie } from '@taskelith/control-plane';
import { failure } from '@taskelith/kernel';

test('a Cookie header names a session only by one non-empty cookie of the name', () => {
  assert.equal(sessionCookie(undefined), undefined);
  assert.equal(sessionCookie('other=1'), undefined);
  assert.equal(sessionCookie(`${SESSION_COOKIE}=`), undefined);
  assert.equal(sessionCookie(`other=1; ${SESSION_COOKIE}=abc`), 'abc');
  assert.equal(sessionCookie(`${SESSION_COOKIE}=abc; ${SESSION_COOKIE}=def`), undefined);
  assert.equal(sessionCookie(`x${SESSION_COOKIE}=abc`), undefined);
});

test('a request log line holds only allowlisted facts, redacted', () => {
  const secret = `tkop_${'C'.repeat(43)}`;
  const fields = requestLogFields({
    method: 'POST', operationId: 'logIn', parameters: ['r', secret], query: new URLSearchParams({ [secret]: secret }), status: 403, durationMs: 2,
    failure: failure('forbidden', `the message ${secret} is not logged`, { reason: 'csrf-token-invalid' }),
  });
  assert.deepEqual(Object.keys(fields).sort(), ['durationMs', 'failureCode', 'failureReason', 'method', 'operationId', 'parameters', 'query', 'status']);
  assert.doesNotMatch(JSON.stringify(fields), /tkop_C/);
  assert.equal(fields.failureReason, 'csrf-token-invalid');
  const bare = requestLogFields({ method: 'GET', operationId: 'readSession', parameters: [], query: new URLSearchParams(), status: 200, durationMs: 1 });
  assert.deepEqual(Object.keys(bare).sort(), ['durationMs', 'method', 'operationId', 'status']);
});

function input(terminal: boolean): PassThrough & { isTTY?: boolean; modes: boolean[]; setRawMode(mode: boolean): void } {
  const stream = Object.assign(new PassThrough(), { modes: [] as boolean[], isTTY: terminal });
  return Object.assign(stream, { setRawMode: (mode: boolean) => { stream.modes.push(mode); } });
}

test('a secret is the first line of standard input, read without echo on a terminal', async () => {
  const piped = input(false);
  const line = readStandardInputLine('Password: ', piped as never);
  piped.write('first ');
  piped.write('part\nsecond line\n');
  assert.equal(await line, 'first part');
  assert.deepEqual(piped.modes, []);
  const terminal = input(true);
  const typed = readStandardInputLine('Password: ', terminal as never);
  terminal.write('typed\r');
  assert.equal(await typed, 'typed');
  assert.deepEqual(terminal.modes, [true, false]);
  const ended = input(false);
  const empty = readStandardInputLine('Password: ', ended as never);
  ended.end('no newline');
  assert.equal(await empty, 'no newline');
});
