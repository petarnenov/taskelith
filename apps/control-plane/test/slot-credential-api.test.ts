import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { X509CertificateIssuer } from '@taskelith/certificates';
import { checkHttpSchema } from '@taskelith/contracts';
import {
  ControlPlaneApi,
  createApiServer,
  type ApiServer,
  type ApiServices,
  type RevealedSlotDelivery,
  type SlotCredentialFetchRequest,
} from '@taskelith/control-plane';
import { authorityValidity, serverCertificateValidity, type WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { SlotSecret } from '@taskelith/scheduling';
import { value } from '@taskelith/testing';

// A fixture value, never a real credential.
const SECRET = 'fixture-api-slot-token';
const BEARER = `tkwk_${'B'.repeat(43)}`;
const PRINCIPAL: WorkerPrincipal = { workerId: 'worker-1' as never, generation: 1 };
const PATH = '/executions/execution-1/slot-credentials/slot-1?attemptId=attempt-1&ownershipGeneration=3&recoveryEpoch=2';

const NOW = value(parseInstant(new Date().toISOString()));
const issuer = new X509CertificateIssuer();
const authority = value(await issuer.createAuthority({ commonName: 'Test authority', validity: value(authorityValidity(NOW)) }));
const leaf = value(await issuer.issueServerCertificate(authority, {
  commonName: 'control plane', hosts: [{ kind: 'ip', name: '127.0.0.1' }], validity: value(serverCertificateValidity(NOW)),
}));

const sink = new InMemoryLogSink();
const asked: Array<{ principal: WorkerPrincipal; request: SlotCredentialFetchRequest }> = [];
let answer: () => Result<RevealedSlotDelivery> = () => err(failure('internal', 'unset'));
let configured = true;

function services(): ApiServices {
  const slotCredentials = {
    fetch: async (principal: WorkerPrincipal, request: SlotCredentialFetchRequest) => {
      asked.push({ principal, request });
      return answer();
    },
  };
  return {
    enrollment: { authenticateWorkerBearer: async (secret: string) => (secret === BEARER ? ok(PRINCIPAL) : err(failure('forbidden', 'unknown bearer'))) },
    get slotCredentials() {
      return configured ? slotCredentials : undefined;
    },
  } as unknown as ApiServices;
}

const logger = new Logger(sink, { now: () => '2026-10-29T10:00:00.000Z' as never });
const tlsServer = createApiServer(new ControlPlaneApi(services()), { logger, tls: { certificate: leaf.certificatePem, key: leaf.privateKeyPem } });
const plainServer = createApiServer(new ControlPlaneApi(services()), { logger });
let tlsPort = 0;
let plainPort = 0;

async function listen(server: ApiServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return (server.address() as AddressInfo).port;
}

before(async () => {
  tlsPort = await listen(tlsServer);
  plainPort = await listen(plainServer);
});
after(async () => {
  await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
  await new Promise<void>((resolve) => plainServer.close(() => resolve()));
});
beforeEach(() => {
  asked.length = 0;
  configured = true;
});

interface Answer {
  readonly status: number;
  readonly cacheControl: string | undefined;
  readonly body: Record<string, unknown>;
  readonly text: string;
}

function get(path: string, { tls = true, bearer = BEARER }: { tls?: boolean; bearer?: string | null } = {}): Promise<Answer> {
  const headers = bearer === null ? {} : { authorization: `Bearer ${bearer}` };
  return new Promise((resolve, reject) => {
    const options = { host: '127.0.0.1', port: tls ? tlsPort : plainPort, path, method: 'GET', headers };
    const sent = tls ? httpsRequest({ ...options, ca: authority.certificatePem }) : httpRequest(options);
    sent.on('response', (response) => {
      let text = '';
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, cacheControl: response.headers['cache-control'], body: JSON.parse(text), text }));
    });
    sent.on('error', reject);
    sent.end();
  });
}

function delivered(): RevealedSlotDelivery {
  return {
    executionId: 'execution-1' as never, slotId: 'slot-1' as never, mechanismId: 'mechanism-1', credentialVersion: 4,
    credential: value(SlotSecret.of(SECRET)),
  };
}

test('a delivery answers 200 with its schema and no-store, for the parsed request of the authenticated worker', async () => {
  answer = () => ok(delivered());
  const before = sink.records.length;
  const answered = await get(PATH);
  assert.equal(answered.status, 200, answered.text);
  assert.equal(answered.cacheControl, 'no-store');
  assert.deepEqual(answered.body, { executionId: 'execution-1', slotId: 'slot-1', mechanismId: 'mechanism-1', credentialVersion: 4, credential: SECRET });
  assert.equal(checkHttpSchema('SlotCredentialDelivery', answered.body).ok, true);
  assert.deepEqual(asked, [{ principal: PRINCIPAL, request: {
    executionId: 'execution-1', slotId: 'slot-1', attemptId: 'attempt-1', ownershipGeneration: 3, recoveryEpoch: 2,
  } }]);
  const logged = JSON.stringify(sink.records.slice(before));
  assert.match(logged, /fetchSlotCredential/);
  assert.doesNotMatch(logged, new RegExp(SECRET), 'the request log holds no response body');
});

test('a refusal answers 422 with its typed reason and reveals nothing', async () => {
  answer = () => err(failure('precondition-failed', 'slot slot-1 is revoked', { reason: 'revoked' }));
  const answered = await get(PATH);
  assert.equal(answered.status, 422);
  assert.equal(checkHttpSchema('SlotCredentialRefusal', answered.body).ok, true, answered.text);
  assert.deepEqual(answered.body.details, { reason: 'revoked' });
  assert.equal((sink.records.at(-1)?.fields as Record<string, unknown>).failureReason, 'revoked');
});

test('a malformed path or query answers 400 before the delivery is asked', async () => {
  const queries = ['?ownershipGeneration=3&recoveryEpoch=2', '?attemptId=attempt-1&ownershipGeneration=0&recoveryEpoch=2',
    '?attemptId=attempt-1&ownershipGeneration=3&recoveryEpoch=x', '?attemptId=attempt-1&ownershipGeneration=3'];
  for (const query of queries) assert.equal((await get(`/executions/execution-1/slot-credentials/slot-1${query}`)).status, 400, query);
  assert.equal((await get('/executions/%E0/slot-credentials/slot-1?attemptId=a&ownershipGeneration=3&recoveryEpoch=2')).status, 400);
  assert.deepEqual(asked, []);
});

test('a missing or unknown bearer answers 401', async () => {
  assert.equal((await get(PATH, { bearer: null })).status, 401);
  assert.equal((await get(PATH, { bearer: `tkwk_${'X'.repeat(43)}` })).status, 401);
  assert.deepEqual(asked, []);
});

test('without a delivery service, as before 12d wires one, the route answers 503 unavailable', async () => {
  configured = false;
  const unconfigured = await get(PATH);
  assert.deepEqual([unconfigured.status, unconfigured.body.code], [503, 'unavailable']);
  assert.doesNotMatch(unconfigured.text, new RegExp(SECRET));
  assert.deepEqual(asked, []);
});

test('a request over plain HTTP is refused before its bearer is read, so no credential is sent in clear', async () => {
  answer = () => ok(delivered());
  const answered = await get(PATH, { tls: false });
  assert.equal(answered.status, 500);
  assert.doesNotMatch(answered.text, new RegExp(SECRET));
  assert.deepEqual(asked, []);
});
