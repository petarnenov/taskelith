import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { EnrollmentRequest } from '@taskelith/fleet';
import type { Failure } from '@taskelith/kernel';
import { HttpEnrollmentClient } from '@taskelith/worker-control-plane-client';
import { failed, id } from '@taskelith/testing';

const TOKEN = `tken_${'B'.repeat(43)}`;
const REQUEST: EnrollmentRequest = {
  journalId: id('JournalId', 'journal-1'),
  host: { platform: 'linux', architecture: 'arm64', hostname: 'build-1' },
  protocolVersions: { minimum: 1, maximum: 1 },
  capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, controls: ['cpu-limit'] },
};

// The failure of one request whose fetch throws the given value.
async function failureOf(thrown: unknown): Promise<Failure> {
  const fetch = () => Promise.reject(thrown);
  const client = new HttpEnrollmentClient({ baseUrl: new URL('http://control-plane.test/'), timeoutMilliseconds: 500, fetch });
  return failed(await client.enroll(TOKEN, REQUEST));
}

function systemError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code, errno: -54, syscall: 'read' });
}

function fetchFailed(cause: unknown): TypeError {
  return new TypeError('fetch failed', { cause });
}

test('a reset connection names its code beside the outer fetch failure', async () => {
  const failure = await failureOf(fetchFailed(systemError('ECONNRESET', 'read ECONNRESET')));
  assert.equal(failure.code, 'unavailable');
  assert.equal(failure.message, 'the control plane did not answer');
  assert.deepEqual(failure.details, {
    cause: 'TypeError: fetch failed <- Error[ECONNRESET]: read ECONNRESET',
    causeCode: 'ECONNRESET',
  });
});

test('a socket closed by the control plane keeps the code of undici', async () => {
  const socket = Object.assign(new Error('other side closed'), { name: 'SocketError', code: 'UND_ERR_SOCKET' });
  const failure = await failureOf(fetchFailed(socket));
  assert.equal(failure.details.cause, 'TypeError: fetch failed <- SocketError[UND_ERR_SOCKET]: other side closed');
  assert.equal(failure.details.causeCode, 'UND_ERR_SOCKET');
});

test('an aggregate error is followed into its first error, and the innermost code wins', async () => {
  const refused = systemError('ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.1:8443');
  const aggregate = Object.assign(new AggregateError([refused], ''), { code: 'ETIMEDOUT' });
  const failure = await failureOf(fetchFailed(aggregate));
  assert.equal(failure.details.cause,
    'TypeError: fetch failed <- AggregateError[ETIMEDOUT] <- Error[ECONNREFUSED]: connect ECONNREFUSED 10.0.0.1:8443');
  assert.equal(failure.details.causeCode, 'ECONNREFUSED');
});

// A loopback port that was just free; fetch refuses well-known bad ports.
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test('a real refused connection reports ECONNREFUSED', async () => {
  const baseUrl = new URL(`http://127.0.0.1:${await closedPort()}/`);
  const unreachable = new HttpEnrollmentClient({ baseUrl, timeoutMilliseconds: 500 });
  const failure = failed(await unreachable.enroll(TOKEN, REQUEST));
  assert.equal(failure.code, 'unavailable');
  assert.equal(failure.details.causeCode, 'ECONNREFUSED');
  assert.match(failure.details.cause ?? '', /^TypeError: fetch failed <- /);
});

test('a cause message keeps no URL, bearer value, secret pair, or token', async () => {
  const secrets = ['pa55w0rd', 'hunter2', 'q=s3cr3t', `tkwk_${'C'.repeat(43)}`, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'abc.def'];
  const message = 'connect to https://owner:pa55w0rd@cp.example:8443/api?q=s3cr3t failed; password=hunter2; '
    + `Authorization: Bearer abc.def; token tkwk_${'C'.repeat(43)}; jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x`;
  const { cause } = (await failureOf(fetchFailed(new Error(message)))).details;
  for (const secret of secrets) assert.ok(!cause?.includes(secret), `${secret} leaked into ${cause}`);
  assert.ok(cause?.includes('[url]'));
  assert.ok(cause?.includes('[redacted]'));
});

test('control characters in a message become spaces, so a cause is one line', async () => {
  const { cause } = (await failureOf(new Error('first line\nsecond\tline\u0000end'))).details;
  assert.equal(cause, 'Error: first line second line end');
});

test('a long or cyclic cause chain is bounded in links and length', async () => {
  let deep: Error = systemError('EDEEP', 'innermost');
  for (let link = 0; link < 10; link += 1) deep = new Error(`link ${link}`, { cause: deep });
  const chained = (await failureOf(deep)).details;
  assert.equal(chained.cause?.split(' <- ').length, 4);
  assert.equal(chained.causeCode, undefined);

  const cyclic = new Error('cyclic');
  Object.assign(cyclic, { cause: cyclic });
  assert.equal((await failureOf(cyclic)).details.cause, 'Error: cyclic');

  const long = 'x '.repeat(5_000);
  const { cause } = (await failureOf(fetchFailed(new Error(long, { cause: new Error(long, { cause: new Error(long) }) })))).details;
  assert.ok((cause?.length ?? 0) <= 512, `cause is ${cause?.length} characters`);
  for (const link of cause?.split(' <- ') ?? []) assert.ok(link.length <= 'Error: '.length + 160);
});

test('an error without a cause or code is named alone, without a cause code', async () => {
  const failure = await failureOf(new Error('boom'));
  assert.deepEqual(failure.details, { cause: 'Error: boom' });
  const timeout = await failureOf(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
  assert.deepEqual(timeout.details, { cause: 'TimeoutError: The operation was aborted due to timeout' });
});

test('a thrown value that is not an error is unknown; names and codes must be identifiers', async () => {
  assert.deepEqual((await failureOf('a string')).details, { cause: 'unknown' });
  const odd = Object.assign(new Error(''), { name: 'not a name', code: 'free text code' });
  assert.deepEqual((await failureOf(odd)).details, { cause: 'Error' });
  assert.deepEqual((await failureOf(fetchFailed('plain cause'))).details, { cause: 'TypeError: fetch failed' });
});
