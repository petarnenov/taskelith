import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { checkHttpSchema } from '@taskelith/contracts';
import type { CredentialRenewalRequest } from '@taskelith/fleet';
import { HttpCredentialRenewalClient } from '@taskelith/worker-control-plane-client';
import { failed, value } from '@taskelith/testing';

// These servers are plain HTTP, so the pinned CA is never used.
const PLAIN_HTTP_CA = 'unused CA';

const BEARER = `tkwk_${'B'.repeat(43)}`;
const RENEWAL_REQUEST: CredentialRenewalRequest = {
  credentialGeneration: 2, brokerUserPublicKey: `U${'A'.repeat(55)}`, controlPlaneSecretSha256: 'ab'.repeat(32) as CredentialRenewalRequest['controlPlaneSecretSha256'],
};
const RENEWAL = { credentialGeneration: 2, brokerUserJwt: 'eyJ.jwt.sig', deadline: '2026-11-01T09:00:00.000Z' };

let answer: { status: number; body: unknown } = { status: 200, body: RENEWAL };
const seen: { path: string | undefined; authorization: string | undefined; body: unknown }[] = [];
const server: Server = createServer(async (request, response) => {
  seen.push({ path: request.url, authorization: request.headers.authorization, body: JSON.parse(await text(request)) });
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

function client(): HttpCredentialRenewalClient {
  return new HttpCredentialRenewalClient({ installationCa: PLAIN_HTTP_CA, baseUrl, timeoutMilliseconds: 2000 });
}

test('a renewal sends only the public key and the hash under the current bearer', async () => {
  answer = { status: 200, body: RENEWAL };
  assert.deepEqual(value(await client().renew(BEARER, RENEWAL_REQUEST)), { credentialGeneration: 2, brokerUserJwt: RENEWAL.brokerUserJwt, deadline: RENEWAL.deadline });
  const request = seen.at(-1)!;
  assert.deepEqual([request.path, request.authorization], ['/api/workers/credentials/renewals', `Bearer ${BEARER}`]);
  assert.ok(checkHttpSchema('CredentialRenewalRequest', request.body).ok);
  assert.deepEqual(request.body, RENEWAL_REQUEST);
});

test('a confirmation names its generation under the new bearer', async () => {
  answer = { status: 200, body: { credentialGeneration: 2, revocationsPublished: false } };
  value(await client().confirm(BEARER, 2));
  const request = seen.at(-1)!;
  assert.deepEqual([request.path, request.body], ['/api/workers/credentials/confirmations', { credentialGeneration: 2 }]);
});

test('a refusal keeps its code and reason; an answer for another generation or schema is internal', async () => {
  answer = { status: 409, body: { code: 'conflict', message: 'refused', details: { reason: 'rotation-not-requested' } } };
  const refused = failed(await client().renew(BEARER, RENEWAL_REQUEST));
  assert.deepEqual([refused.code, refused.details.reason], ['conflict', 'rotation-not-requested']);
  assert.equal(refused.message.includes(BEARER), false);
  answer = { status: 503, body: { code: 'unavailable', message: 'down', details: {} } };
  assert.equal(failed(await client().confirm(BEARER, 2)).code, 'unavailable');
  answer = { status: 200, body: { ...RENEWAL, credentialGeneration: 3 } };
  assert.equal(failed(await client().renew(BEARER, RENEWAL_REQUEST)).code, 'internal');
  answer = { status: 200, body: { ...RENEWAL, brokerUserJwt: '' } };
  assert.equal(failed(await client().renew(BEARER, RENEWAL_REQUEST)).code, 'internal');
  answer = { status: 200, body: { credentialGeneration: 3, revocationsPublished: true } };
  assert.equal(failed(await client().confirm(BEARER, 2)).code, 'internal');
  answer = { status: 200, body: {} };
  assert.equal(failed(await client().confirm(BEARER, 2)).code, 'internal');
});

test('no answer is unavailable', async () => {
  const unreachable = new HttpCredentialRenewalClient({ installationCa: PLAIN_HTTP_CA, baseUrl: new URL('http://127.0.0.1:1/'), timeoutMilliseconds: 500 });
  assert.equal(failed(await unreachable.renew(BEARER, RENEWAL_REQUEST)).code, 'unavailable');
  assert.equal(failed(await unreachable.confirm(BEARER, 2)).code, 'unavailable');
});
