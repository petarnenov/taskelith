import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { SESSION_COOKIE, readStandardInputLine, requestLogFields, sessionCookie } from '@taskelith/control-plane';
import { failure } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

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
    method: 'POST', operationId: 'logIn', parameters: ['r', secret], query: new URLSearchParams({ [secret]: secret, from: secret }), declaredQuery: ['from'],
    status: 403, durationMs: 2,
    failure: failure('forbidden', `the message ${secret} is not logged`, { reason: 'csrf-token-invalid' }),
  });
  assert.deepEqual(Object.keys(fields).sort(), ['durationMs', 'failureCode', 'failureReason', 'method', 'operationId', 'parameters', 'query', 'status']);
  assert.doesNotMatch(JSON.stringify(fields), /tkop_C/);
  assert.equal(fields.failureReason, 'csrf-token-invalid');
  const bare = requestLogFields({
    method: 'GET', operationId: 'readSession', parameters: [], query: new URLSearchParams(), declaredQuery: [], status: 200, durationMs: 1,
  });
  assert.deepEqual(Object.keys(bare).sort(), ['durationMs', 'method', 'operationId', 'status']);
});

test('a request log holds only the query parameters its operation declares', () => {
  const token = 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5';
  const query = new URLSearchParams({ password: 'correct horse battery staple', csrfToken: token, sessionId: token, from: '7' });
  const fields = requestLogFields({ method: 'GET', operationId: 'listQuarantine', parameters: [], query, declaredQuery: ['from'], status: 200, durationMs: 1 });
  assert.equal(fields.query, 'from=7');
  const undeclared = requestLogFields({ method: 'GET', operationId: 'readSession', parameters: [], query, declaredQuery: [], status: 200, durationMs: 1 });
  assert.equal(undeclared.query, undefined);
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
  assert.equal(value(await line), 'first part');
  assert.deepEqual(piped.modes, []);
  const terminal = input(true);
  const typed = readStandardInputLine('Password: ', terminal as never);
  terminal.write('typed\r');
  assert.equal(value(await typed), 'typed');
  assert.deepEqual(terminal.modes, [true, false]);
  const ended = input(false);
  const empty = readStandardInputLine('Password: ', ended as never);
  ended.end('no newline');
  assert.equal(value(await empty), 'no newline');
});

test('a multibyte character split across chunks is read whole, at every split', async () => {
  const bytes = Buffer.from('café ünïcödé\n', 'utf8');
  for (let split = 1; split < bytes.length; split++) {
    const piped = input(false);
    const line = readStandardInputLine('Password: ', piped as never);
    piped.write(bytes.subarray(0, split));
    piped.write(bytes.subarray(split));
    assert.equal(value(await line), 'café ünïcödé', `split at byte ${split}`);
  }
  const ended = input(false);
  const line = readStandardInputLine('Password: ', ended as never);
  ended.write(Buffer.from('é', 'utf8').subarray(0, 1));
  ended.end();
  assert.equal(value(await line), '\ufffd', 'a truncated character at the end is not dropped silently');
});

test('Ctrl-C on a terminal cancels the input and restores the terminal mode', async () => {
  const terminal = input(true);
  const typed = readStandardInputLine('Password: ', terminal as never);
  terminal.write('a partial password\u0003');
  assert.deepEqual([failed(await typed).details.reason, terminal.modes], ['cancelled', [true, false]]);
});
