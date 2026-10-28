import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { checkHttpSchema } from '@taskelith/contracts';
import type { LaunchAuthorizationRequest } from '@taskelith/execution';
import { HttpLaunchAuthorityClient } from '@taskelith/worker-control-plane-client';
import { failed, id, value } from '@taskelith/testing';

// These servers are plain HTTP, so the pinned CA is never used.
const PLAIN_HTTP_CA = 'unused CA';

const CREDENTIAL = `tkwk_${'A'.repeat(43)}`;
const REQUEST = {
  operationId: id('OperationId', 'operation-1'), recoveryEpoch: 1, assignmentId: id('AssignmentId', 'assignment-1'),
  attemptId: id('AttemptId', 'attempt-1'), ownershipGeneration: 2, executionId: id('ExecutionId', 'execution-1'),
  admissionId: id('AdmissionId', 'admission-1'), admissionGeneration: 3, reportsNotStarted: false,
} as unknown as LaunchAuthorizationRequest;
const GRANT = {
  launchAuthId: 'launch-1', operationId: 'operation-1', executionId: 'execution-1', assignmentId: 'assignment-1', attemptId: 'attempt-1',
  workerId: 'worker-1', ownershipGeneration: 2, recoveryEpoch: 1, admissionId: 'admission-1', admissionGeneration: 3,
  reliedOnGates: ['gate-1'], artifacts: [{ artifactId: 'spec', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'spec.md' }],
  policyRevision: 'policy-1', issuedAt: '2026-10-25T09:00:00.000Z', ttlMilliseconds: 30_000, skewMilliseconds: 5_000,
};

interface Seen {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

let answer: { status: number; body: unknown; delayMilliseconds?: number } = { status: 200, body: {} };
const seen: Seen[] = [];
const server: Server = createServer(async (request, response) => {
  seen.push({ method: request.method, path: request.url, authorization: request.headers.authorization, body: JSON.parse(await text(request)) });
  if (answer.delayMilliseconds !== undefined) await new Promise((resolve) => setTimeout(resolve, answer.delayMilliseconds));
  response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body));
});
let baseUrl: URL;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`);
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function text(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body;
}

function client(timeoutMilliseconds = 2000): HttpLaunchAuthorityClient {
  return new HttpLaunchAuthorityClient({ installationCa: PLAIN_HTTP_CA, baseUrl, bearer: () => CREDENTIAL, timeoutMilliseconds });
}

test('a request carries the bearer and the contract body, and a grant comes back as the domain grant', async () => {
  answer = { status: 200, body: { outcome: 'granted', grant: GRANT } };
  const outcome = value(await client().authorize(REQUEST));
  assert.equal(outcome.kind, 'granted');
  const grant = (outcome as Extract<typeof outcome, { kind: 'granted' }>).grant;
  const { parameters, state, ...values } = grant;
  assert.deepEqual({ ...values, ttlMilliseconds: parameters.ttlMilliseconds, skewMilliseconds: parameters.skewMilliseconds }, GRANT);
  assert.equal(state, 'granted');
  const request = seen.at(-1)!;
  assert.deepEqual([request.method, request.path, request.authorization], ['POST', '/api/launch-authorizations', `Bearer ${CREDENTIAL}`]);
  assert.ok(checkHttpSchema('LaunchAuthorizationRequest', request.body).ok);
});

test('the bearer is read at each request, so an adopted generation is used at once', async () => {
  answer = { status: 200, body: { outcome: 'expired' } };
  let bearer = CREDENTIAL;
  const rotating = new HttpLaunchAuthorityClient({ installationCa: PLAIN_HTTP_CA, baseUrl, bearer: () => bearer, timeoutMilliseconds: 2000 });
  value(await rotating.authorize(REQUEST));
  bearer = `tkwk_${'N'.repeat(43)}`;
  value(await rotating.authorize(REQUEST));
  assert.deepEqual(seen.slice(-2).map(({ authorization }) => authorization), [`Bearer ${CREDENTIAL}`, `Bearer ${bearer}`]);
});

test('a base without a trailing slash keeps its path', async () => {
  answer = { status: 200, body: { outcome: 'expired' } };
  const bare = new URL(baseUrl.href.replace(/\/$/, ''));
  value(await new HttpLaunchAuthorityClient({ installationCa: PLAIN_HTTP_CA, baseUrl: bare, bearer: () => CREDENTIAL, timeoutMilliseconds: 2000 }).authorize(REQUEST));
  assert.equal(seen.at(-1)!.path, '/api/launch-authorizations');
});

test('a rejection, a revoked grant, and an expired one come back as decided', async () => {
  const rejection = { reason: 'gate-not-passed', retryable: false, message: 'gate gate-1 has not passed' };
  answer = { status: 200, body: { outcome: 'rejected', rejection } };
  assert.deepEqual(value(await client().authorize(REQUEST)), { kind: 'rejected', rejection });
  answer = { status: 200, body: { outcome: 'revoked', reason: 'worker-not-authorized' } };
  assert.deepEqual(value(await client().authorize(REQUEST)), { kind: 'revoked', reason: 'worker-not-authorized' });
  answer = { status: 200, body: { outcome: 'expired' } };
  assert.deepEqual(value(await client().authorize(REQUEST)), { kind: 'expired' });
});

test('only a 503, a timeout, or no connection is undecided', async () => {
  const failure = { code: 'unavailable', message: 'no decision', details: {} };
  answer = { status: 503, body: failure };
  assert.deepEqual([failed(await client().authorize(REQUEST)).code, failed(await client().authorize(REQUEST)).details.status], ['unavailable', '503']);
  answer = { status: 200, body: { outcome: 'expired' }, delayMilliseconds: 300 };
  assert.equal(failed(await client(50).authorize(REQUEST)).code, 'unavailable');
  const closed = new HttpLaunchAuthorityClient({ installationCa: PLAIN_HTTP_CA, baseUrl: new URL('http://127.0.0.1:1/'), bearer: () => CREDENTIAL, timeoutMilliseconds: 500 });
  assert.equal(failed(await closed.authorize(REQUEST)).code, 'unavailable');
  for (const [status, code] of [[502, 'unavailable'], [504, 'unavailable'], [401, 'forbidden'], [400, 'invalid'], [500, 'internal']] as const) {
    answer = { status, body: { ...failure, code } };
    assert.equal(failed(await client().authorize(REQUEST)).code, code, String(status));
  }
});

test('an answer that breaks its schema or its values is internal, never a grant', async () => {
  answer = { status: 200, body: { outcome: 'granted', grant: { ...GRANT, ttlMilliseconds: undefined } } };
  assert.equal(failed(await client().authorize(REQUEST)).code, 'internal');
  answer = { status: 200, body: { outcome: 'granted', grant: { ...GRANT, skewMilliseconds: 30_000 } } };
  assert.equal(failed(await client().authorize(REQUEST)).code, 'internal', 'a skew not shorter than the ttl');
  answer = { status: 200, body: { outcome: 'granted', grant: { ...GRANT, executionId: 'execution-2' } } };
  assert.equal(failed(await client().authorize(REQUEST)).code, 'internal', 'a grant for another execution');
  answer = { status: 200, body: { outcome: 'granted', grant: { ...GRANT, operationId: 'operation-2' } } };
  assert.equal(failed(await client().authorize(REQUEST)).code, 'internal', 'a grant for another operation');
  answer = { status: 500, body: 'not json' };
  assert.equal(failed(await client().authorize(REQUEST)).code, 'internal');
});
