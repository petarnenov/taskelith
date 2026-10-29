import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';
import { after, before, test } from 'node:test';
import { X509CertificateIssuer } from '@taskelith/certificates';
import type { SlotCredentialFetch } from '@taskelith/execution';
import { authorityValidity, serverCertificateValidity } from '@taskelith/fleet';
import { parseInstant } from '@taskelith/kernel';
import { failed, id, value } from '@taskelith/testing';
import { HttpSlotCredentialClient } from '@taskelith/worker-control-plane-client';

// A fixture value, never a real credential.
const SECRET = 'fixture-slot-token-not-real';
const BEARER = `tkwk_${'S'.repeat(43)}`;
const REQUEST = {
  executionId: id('ExecutionId', 'execution#1'), slotId: id('ProviderCredentialId', 'slot/1'), attemptId: id('AttemptId', 'attempt-1'),
  ownershipGeneration: 3, recoveryEpoch: 2,
} as unknown as SlotCredentialFetch;
const DELIVERY = { executionId: 'execution#1', slotId: 'slot/1', mechanismId: 'mechanism-1', credentialVersion: 4, credential: SECRET };

const NOW = value(parseInstant(new Date().toISOString()));
const issuer = new X509CertificateIssuer();
const authority = value(await issuer.createAuthority({ commonName: 'Test authority', validity: value(authorityValidity(NOW)) }));
const leaf = value(await issuer.issueServerCertificate(authority, {
  commonName: 'control plane', hosts: [{ kind: 'ip', name: '127.0.0.1' }], validity: value(serverCertificateValidity(NOW)),
}));

let answer: { status: number; body: unknown } = { status: 200, body: DELIVERY };
const seen: Array<{ method?: string; url?: string; authorization?: string }> = [];
const server: Server = createServer({ cert: leaf.certificatePem, key: leaf.privateKeyPem }, (request, response) => {
  seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
  request.resume();
  response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body));
});
let baseUrl: URL;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = new URL(`https://127.0.0.1:${(server.address() as AddressInfo).port}/api/`);
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

function client(base = baseUrl): HttpSlotCredentialClient {
  return new HttpSlotCredentialClient({ installationCa: authority.certificatePem, baseUrl: base, bearer: () => BEARER, timeoutMilliseconds: 5000 });
}

test('a fetch is a GET over pinned TLS with the bearer, and the delivery is held redacted', async () => {
  answer = { status: 200, body: DELIVERY };
  seen.length = 0;
  const outcome = value(await client().fetch(REQUEST));
  assert.deepEqual(seen, [{
    method: 'GET', url: '/api/executions/execution%231/slot-credentials/slot%2F1?attemptId=attempt-1&ownershipGeneration=3&recoveryEpoch=2',
    authorization: `Bearer ${BEARER}`,
  }]);
  assert.equal(outcome.kind, 'delivered');
  const { credential } = outcome as Extract<typeof outcome, { kind: 'delivered' }>;
  assert.deepEqual([credential.executionId, credential.slotId, credential.mechanismId, credential.credentialVersion], ['execution#1', 'slot/1', 'mechanism-1', 4]);
  assert.equal(credential.reveal(), SECRET);
  for (const shown of [String(credential), JSON.stringify(outcome), inspect(outcome, { depth: 5 })]) assert.doesNotMatch(shown, new RegExp(SECRET));
});

test('a refusal comes back as its typed reason', async () => {
  answer = { status: 422, body: { code: 'precondition-failed', message: 'slot slot/1 is revoked', details: { reason: 'revoked' } } };
  assert.deepEqual(value(await client().fetch(REQUEST)), { kind: 'refused', refusal: { reason: 'revoked', message: 'slot slot/1 is revoked' } });
});

test('a delivery that breaks its schema or names another execution or slot is not used, and no failure holds the credential', async () => {
  const bodies = [
    { ...DELIVERY, executionId: 'execution-2' },
    { ...DELIVERY, slotId: 'slot-2' },
    { ...DELIVERY, extra: SECRET },
    { ...DELIVERY, credentialVersion: 0 },
  ];
  for (const body of bodies) {
    answer = { status: 200, body };
    const refused = failed(await client().fetch(REQUEST));
    assert.equal(refused.code, 'internal', JSON.stringify(refused));
    assert.doesNotMatch(`${refused.message} ${JSON.stringify(refused.details)}`, new RegExp(SECRET));
  }
});

test('another status is a failure by its code', async () => {
  answer = { status: 503, body: { code: 'unavailable', message: 'the database is not available', details: {} } };
  assert.equal(failed(await client().fetch(REQUEST)).code, 'unavailable');
  answer = { status: 422, body: { code: 'precondition-failed', message: 'odd', details: { reason: 'not-a-reason' } } };
  assert.equal(failed(await client().fetch(REQUEST)).code, 'precondition-failed');
});

test('a base URL that is not HTTPS sends nothing', async () => {
  seen.length = 0;
  const plain = new URL(baseUrl.href.replace('https:', 'http:'));
  assert.equal(failed(await client(plain).fetch(REQUEST)).code, 'invalid');
  assert.deepEqual(seen, []);
});
