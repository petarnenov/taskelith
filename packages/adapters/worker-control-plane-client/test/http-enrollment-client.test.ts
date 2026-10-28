import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { checkHttpSchema } from '@taskelith/contracts';
import type { EnrollmentRequest } from '@taskelith/fleet';
import { HttpEnrollmentClient } from '@taskelith/worker-control-plane-client';
import { failed, id, value } from '@taskelith/testing';

// These servers are plain HTTP, so the pinned CA is never used.
const PLAIN_HTTP_CA = 'unused CA';

const TOKEN = `tken_${'B'.repeat(43)}`;
const REQUEST: EnrollmentRequest = {
  journalId: id('JournalId', 'journal-1'),
  host: { platform: 'linux', architecture: 'arm64', hostname: 'build-1' },
  protocolVersions: { minimum: 1, maximum: 1 },
  capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, controls: ['cpu-limit'] },
};
const ENROLLMENT = {
  installationId: 'a'.repeat(32), workerId: `w${'b'.repeat(32)}`, credentialGeneration: 1, recoveryEpoch: 1,
  protocolVersions: { minimum: 1, maximum: 1 }, credentials: { controlPlane: `tkwk_${'C'.repeat(43)}`, broker: 'creds text' },
};

let answer: { status: number; body: unknown; delayMilliseconds?: number } = { status: 201, body: ENROLLMENT };
const seen: { path: string | undefined; authorization: string | undefined; body: unknown }[] = [];
const server: Server = createServer(async (request, response) => {
  seen.push({ path: request.url, authorization: request.headers.authorization, body: JSON.parse(await text(request)) });
  if (answer.delayMilliseconds !== undefined) await new Promise((resolve) => setTimeout(resolve, answer.delayMilliseconds));
  response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body));
});
let baseUrl: URL;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function text(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body;
}

function client(timeoutMilliseconds = 2000): HttpEnrollmentClient {
  return new HttpEnrollmentClient({ installationCa: PLAIN_HTTP_CA, baseUrl, timeoutMilliseconds });
}

test('the token is the bearer, the body is the contract request, and the enrollment comes back', async () => {
  answer = { status: 201, body: ENROLLMENT };
  const enrolled = value(await client().enroll(TOKEN, REQUEST));
  assert.deepEqual(enrolled, ENROLLMENT);
  const request = seen.at(-1)!;
  assert.equal(request.path, '/api/workers/enrollments');
  assert.equal(request.authorization, `Bearer ${TOKEN}`);
  assert.ok(checkHttpSchema('EnrollmentRequest', request.body).ok);
  assert.deepEqual((request.body as { capacity: unknown }).capacity, { slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, enforceableControls: ['cpu-limit'] });
});

test('each refusal keeps its code and the service reason', async () => {
  const cases = [
    [401, 'forbidden', 'token-invalid'], [409, 'conflict', 'journal-enrolled'], [422, 'precondition-failed', 'host-mismatch'],
    [400, 'invalid', 'body'], [503, 'unavailable', 'database'], [500, 'internal', 'bug'],
  ] as const;
  for (const [status, code, reason] of cases) {
    answer = { status, body: { code, message: 'refused', details: { reason } } };
    const failure = failed(await client().enroll(TOKEN, REQUEST));
    assert.deepEqual([failure.code, failure.details.reason, failure.details.status], [code, reason, String(status)]);
    assert.equal(failure.message.includes(TOKEN), false);
  }
  answer = { status: 502, body: 'not json' };
  const bare = failed(await client().enroll(TOKEN, REQUEST));
  assert.deepEqual([bare.code, bare.details.reason], ['unavailable', undefined]);
});

test('an answer that breaks the schema or holds invalid identifiers is not an enrollment', async () => {
  answer = { status: 201, body: { ...ENROLLMENT, credentials: { controlPlane: '' } } };
  assert.equal(failed(await client().enroll(TOKEN, REQUEST)).code, 'internal');
  answer = { status: 201, body: { ...ENROLLMENT, workerId: 'worker.with.dots' } };
  assert.equal(failed(await client().enroll(TOKEN, REQUEST)).code, 'internal');
});

test('a timeout or a lost connection is unavailable', async () => {
  answer = { status: 201, body: ENROLLMENT, delayMilliseconds: 300 };
  assert.equal(failed(await client(50).enroll(TOKEN, REQUEST)).code, 'unavailable');
  const unreachable = new HttpEnrollmentClient({ installationCa: PLAIN_HTTP_CA, baseUrl: new URL('http://127.0.0.1:1/'), timeoutMilliseconds: 500 });
  assert.equal(failed(await unreachable.enroll(TOKEN, REQUEST)).code, 'unavailable');
});

// Shaped as Node's fetch throws them: a TypeError whose cause holds the code,
// passed through the client's own error handling by an injected fetch.
function refusingFetch(code: string) {
  return async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('certificate refused'), { code }) });
  };
}

test('every certificate refusal code, the long ones too, is untrusted, not unavailable', async () => {
  for (const code of ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    const refusing = new HttpEnrollmentClient({ installationCa: PLAIN_HTTP_CA, baseUrl, timeoutMilliseconds: 2000, fetch: refusingFetch(code) });
    const refused = failed(await refusing.enroll(TOKEN, REQUEST));
    assert.deepEqual([refused.code, refused.details.reason], ['precondition-failed', 'installation-ca-untrusted'], code);
  }
  const reset = new HttpEnrollmentClient({ installationCa: PLAIN_HTTP_CA, baseUrl, timeoutMilliseconds: 2000, fetch: refusingFetch('ECONNRESET') });
  assert.equal(failed(await reset.enroll(TOKEN, REQUEST)).code, 'unavailable');
});
