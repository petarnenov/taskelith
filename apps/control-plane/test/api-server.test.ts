import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import {
  ControlPlaneApi,
  DelegationService,
  ROUTES,
  StatusAnswer,
  createApiServer,
  type ApiHandlers,
  type ApiRequest,
  type ControlPlaneStore,
  type RouteDefinition,
  type Upload,
} from '@taskelith/control-plane';
import type { PrincipalId } from '@taskelith/access';
import { checkHttpSchema } from '@taskelith/contracts';
import { parseLaunchParameters, REPORTED_SEALS_LIMIT, type LaunchGrant, type LaunchOutcome } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, value } from '@taskelith/testing';

const OPERATOR = `tkop_${'A'.repeat(43)}`;
const sink = new InMemoryLogSink();
let answers: Record<string, () => Result<unknown>> = {};

// Handlers that answer what each test sets, behind the real server.
let storeDown = false;
const handlers: ApiHandlers = {
  authenticateOperator: async (secret) => {
    if (storeDown) return err(failure('unavailable', 'the credential store is down'));
    return secret === OPERATOR ? ok(`u${'0'.repeat(32)}` as PrincipalId) : err(failure('forbidden', 'not the operator'));
  },
  authenticateWorker: async () => err(failure('forbidden', 'no worker in these tests')),
  authenticateSession: async () => err(failure('forbidden', 'no session in these tests', { reason: 'unauthenticated' })),
  authorize: async () => ok(undefined),
  authorizeResource: async () => ok(undefined),
  handle: async (operationId) => (answers[operationId] ?? (() => err(failure('internal', 'unset'))))(),
};
const server = createApiServer(handlers, { logger: new Logger(sink, { now: () => '2026-10-25T09:00:00.000Z' as never }) });
let base: string;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: string) {
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${OPERATOR}`, ...headers }, ...(body === undefined ? {} : { body }) });
  return { status: response.status, body: await response.json() as Record<string, unknown>, correlationId: response.headers.get('x-correlation-id') };
}

test('the bearer scheme is matched in any case, and the token exactly', async () => {
  answers = { readTaskResult: () => ok({ state: 'pending', runId: 'r', taskId: 't' }) };
  for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
    assert.equal((await call('GET', '/runs/r/tasks/t/result', { authorization: `${scheme} ${OPERATOR}` })).status, 200, scheme);
  }
  assert.equal((await call('GET', '/runs/r/tasks/t/result', { authorization: `Bearer ${OPERATOR.toLowerCase()}` })).status, 401);
});

// A syntactically valid block; the response check reads no DER.
const CERTIFICATE = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(64)}\n-----END CERTIFICATE-----\n`;

test('the installation CA is public: no bearer is needed, and one is ignored', async () => {
  let api = new ControlPlaneApi({ installationCa: CERTIFICATE } as never);
  answers = { readInstallationCa: () => ok({ certificate: CERTIFICATE }) };
  const bare = await fetch(`${base}/installation/ca`);
  assert.deepEqual([bare.status, await bare.json()], [200, { certificate: CERTIFICATE }]);
  assert.equal((await call('GET', '/installation/ca', { authorization: 'Bearer tkop_wrong' })).status, 200);
  assert.deepEqual(value(await api.handle('readInstallationCa', { parameters: [] } as unknown as ApiRequest, '')), { certificate: CERTIFICATE });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  api = new ControlPlaneApi({ installationCa: `${CERTIFICATE}${key}` } as never);
  answers = { readInstallationCa: async () => api.handle('readInstallationCa', { parameters: [] } as unknown as ApiRequest, '') } as never;
  const keyed = await fetch(`${base}/installation/ca`);
  const body = await keyed.text();
  assert.equal(keyed.status, 500, 'an answer with key material is a defect, never sent');
  assert.doesNotMatch(body, /PRIVATE KEY/);
});

test('every status a route of the execution document answers is declared there', () => {
  const document = JSON.parse(readFileSync(new URL('../../../packages/contracts/documents/execution.openapi.json', import.meta.url), 'utf8'));
  const declared = new Map<string, string[]>();
  for (const item of Object.values(document.paths) as Array<Record<string, { operationId: string; responses: object }>>) {
    for (const operation of Object.values(item)) declared.set(operation.operationId, Object.keys(operation.responses));
  }
  const documented = ROUTES.filter((route) => declared.has(route.operationId));
  assert.ok(documented.some((route) => route.operationId === 'readInstallationCa'));
  for (const route of documented) {
    const answered = [route.success, ...Object.values(route.statuses)].map(String);
    assert.deepEqual(answered.filter((status) => !declared.get(route.operationId)!.includes(status)), [], route.operationId);
  }
});

test('a credential store that is down is 503, not a refused credential', async () => {
  storeDown = true;
  try {
    const answered = await call('GET', '/runs/r/tasks/t/result');
    assert.deepEqual([answered.status, answered.body.code], [503, 'unavailable']);
  } finally {
    storeDown = false;
  }
});

test('a malformed percent-encoding is 400, and the server stays up', async () => {
  assert.equal((await call('GET', '/runs/%ZZ/tasks/t/result')).status, 400);
  answers = { readTaskResult: () => ok({ state: 'pending', runId: 'r', taskId: 't' }) };
  assert.equal((await call('GET', '/runs/r/tasks/t/result')).status, 200);
});

test('a success that breaks its schema is 500, never sent as is', async () => {
  answers = { readTaskResult: () => ok({ state: 'pending' }) };
  const broken = await call('GET', '/runs/r/tasks/t/result');
  assert.deepEqual([broken.status, broken.body.code], [500, 'internal']);
});

test('a body that is not JSON, too large, or missing is 400', async () => {
  for (const body of ['{', 'x'.repeat(1024 ** 2 + 1)]) {
    assert.equal((await call('POST', '/runs', { 'content-type': 'application/json' }, body)).status, 400);
  }
  assert.equal((await call('POST', '/runs')).status, 400);
});

test('a failure code maps to the status of its operation, and an unknown one to 500', async () => {
  answers = { readAdmission: () => err(failure('not-found', 'no admission')) };
  assert.equal((await call('GET', '/runs/r/admissions/a')).status, 404);
  answers = { readAdmission: () => err(failure('conflict', 'unexpected')) };
  assert.equal((await call('GET', '/runs/r/admissions/a')).status, 500);
});

test('a correlation that carries a secret is replaced, so no log line holds it', async () => {
  answers = { readTaskResult: () => ok({ state: 'pending', runId: 'r', taskId: 't' }) };
  const answered = await call('GET', '/runs/r/tasks/t/result', { 'x-correlation-id': OPERATOR });
  assert.match(answered.correlationId ?? '', /^c-/);
  assert.equal((await call('GET', '/runs/r/tasks/t/result', { 'x-correlation-id': 'corr-1' })).correlationId, 'corr-1');
  assert.doesNotMatch(JSON.stringify(sink.records), /tkop_/);
});

test('every response closes its connection, so no idle socket is reused', async () => {
  answers = { readTaskResult: () => ok({ state: 'pending', runId: 'r', taskId: 't' }) };
  let connections = 0;
  const counted = () => { connections++; };
  server.on('connection', counted);
  try {
    const headers = { authorization: `Bearer ${OPERATOR}` };
    for (let request = 0; request < 2; request++) {
      const response = await fetch(`${base}/runs/r/tasks/t/result`, { headers });
      await response.arrayBuffer();
      assert.equal(response.headers.get('connection'), 'close');
    }
    assert.equal(connections, 2);
  } finally {
    server.off('connection', counted);
  }
});

test('a redrive sequence that is not a positive safe integer is 400 before the broker', async () => {
  let redriven = 0;
  const api = new ControlPlaneApi({
    sessions: undefined as never, authorization: undefined as never, runProjects: undefined as never,
    installationCa: undefined as never, runs: undefined as never, tasks: undefined as never, evidence: undefined as never, delegations: undefined as never, operator: undefined as never,
    enrollment: undefined as never, launches: undefined as never,
    quarantine: { records: async () => ok([]), redrive: async () => (redriven++, ok(null)) },
  });
  for (const sequence of ['0', '9007199254740993']) {
    const outcome = await api.handle('redriveQuarantined', { parameters: [sequence], body: undefined, query: new URLSearchParams(), correlationId: 'c' as never }, '');
    assert.equal(!outcome.ok && outcome.error.code, 'invalid');
  }
  assert.equal(redriven, 0);
  assert.deepEqual(await api.handle('redriveQuarantined', { parameters: ['7'], body: undefined, query: new URLSearchParams(), correlationId: 'c' as never }, ''), ok({ sequence: 7 }));
});

test('evidence content is sent as exact bytes, and a handler that returns no bytes is 500', async () => {
  answers = { downloadEvidence: () => ok(Uint8Array.of(0, 255, 10)) };
  const response = await fetch(`${base}/evidence/evidence-1/content`, { headers: { authorization: `Bearer ${OPERATOR}` } });
  assert.deepEqual([response.status, response.headers.get('content-type'), response.headers.get('x-content-type-options')],
    [200, 'application/octet-stream', 'nosniff']);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 255, 10]);
  answers = { downloadEvidence: () => ok('text') };
  assert.equal((await call('GET', '/evidence/evidence-1/content')).status, 500);
  answers = { downloadEvidence: () => err(failure('internal', 'corrupt', { reason: 'evidence-corrupt' })) };
  assert.equal((await call('GET', '/evidence/evidence-1/content')).status, 500);
  answers = { readEvidence: () => err(failure('not-found', 'no evidence')) };
  assert.equal((await call('GET', '/evidence/evidence-9')).status, 404);
});

test('a worker route reaches its operation with the principal of a valid worker bearer only, whatever it declares', async () => {
  const WORKER = `tkwk_${'B'.repeat(43)}`;
  const probe: RouteDefinition = {
    // A worker operation, which needs no role; an unknown one would.
    operationId: 'authorizeLaunch', method: 'GET', pattern: /^\/probe$/, security: ['workerCredential'], response: 'TaskResult', success: 200,
    statuses: { forbidden: 418, unavailable: 500 },
  };
  const seen: ApiRequest[] = [];
  let workerStoreDown = false;
  const workerServer = createApiServer({
    ...handlers,
    authenticateWorker: async (secret) => {
      if (workerStoreDown) return err(failure('unavailable', 'connect ECONNREFUSED 10.0.0.5:5432'));
      if (secret !== WORKER) return err(failure('forbidden', 'the worker credential is not valid', { reason: 'worker-not-authorized' }));
      return ok({ workerId: 'worker-1' as never, generation: 2 });
    },
    handle: async (_operationId, request) => {
      seen.push(request);
      return ok({ state: 'pending', runId: 'r', taskId: 't' });
    },
  }, { routes: [...ROUTES, probe] });
  await new Promise<void>((resolve) => workerServer.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => workerServer.close(() => resolve())));
  const url = `http://127.0.0.1:${(workerServer.address() as AddressInfo).port}/probe`;
  const probeWith = async (bearer: string) => {
    const response = await fetch(url, { headers: { authorization: `Bearer ${bearer}` } });
    return { status: response.status, text: await response.text() };
  };

  assert.equal((await probeWith(WORKER)).status, 200);
  assert.deepEqual(seen.map((request) => request.worker), [{ workerId: 'worker-1', generation: 2 }]);
  for (const bearer of [OPERATOR, `tkwk_${'C'.repeat(43)}`]) {
    const refused = await probeWith(bearer);
    assert.equal(refused.status, 401);
    assert.deepEqual(JSON.parse(refused.text), { code: 'forbidden', message: 'the worker credential is not valid', details: { reason: 'worker-not-authorized' } });
  }
  workerStoreDown = true;
  const down = await probeWith(WORKER);
  assert.deepEqual([down.status, JSON.parse(down.text).message], [503, 'the credential store is not available']);
  assert.equal(seen.length, 1, 'no refused or unchecked request reaches the operation');
});

test('an operator route carries no worker principal', async () => {
  const requests: ApiRequest[] = [];
  answers = { readTaskResult: () => ok({ state: 'pending', runId: 'r', taskId: 't' }) };
  const recording = createApiServer({ ...handlers, handle: async (operationId, request, bearer) => (requests.push(request), handlers.handle(operationId, request, bearer)) });
  await new Promise<void>((resolve) => recording.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => recording.close(() => resolve())));
  const origin = `http://127.0.0.1:${(recording.address() as AddressInfo).port}`;
  assert.equal((await fetch(`${origin}/runs/r/tasks/t/result`, { headers: { authorization: `Bearer ${OPERATOR}` } })).status, 200);
  assert.deepEqual(requests.map((request) => 'worker' in request), [false]);
});

test('the API authenticates a worker bearer through enrollment', async () => {
  const principal = { workerId: 'worker-1' as never, generation: 1 };
  const api = new ControlPlaneApi({
    sessions: undefined as never, authorization: undefined as never, runProjects: undefined as never,
    installationCa: undefined as never, runs: undefined as never, tasks: undefined as never, evidence: undefined as never, delegations: undefined as never, operator: undefined as never, quarantine: undefined as never,
    launches: undefined as never,
    enrollment: { enroll: undefined as never, renew: undefined as never, confirm: undefined as never, authenticateWorkerBearer: async (secret) => (secret === 'tkwk_x' ? ok(principal) : err(failure('forbidden', 'no'))) },
  });
  assert.deepEqual(await api.authenticateWorker('tkwk_x'), ok(principal));
  assert.equal((await api.authenticateWorker('tkwk_y')).ok, false);
});

test('an evidence upload reaches its operation with the record and the exact content bytes', async () => {
  const WORKER = `tkwk_${'D'.repeat(43)}`;
  const uploads: Upload[] = [];
  let answer: () => Result<unknown> = () => ok(undefined);
  const uploadServer = createApiServer({
    ...handlers,
    authenticateWorker: async (secret) => (secret === WORKER ? ok({ workerId: 'worker-1' as never, generation: 1 }) : err(failure('forbidden', 'no'))),
    handle: async (_operationId, request) => (uploads.push(request.body as Upload), answer()),
  });
  await new Promise<void>((resolve) => uploadServer.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => uploadServer.close(() => resolve())));
  const url = `http://127.0.0.1:${(uploadServer.address() as AddressInfo).port}/evidence`;
  const content = Buffer.from([0xff, 0xfe, 0x00, 0x0d, 0x0a, 0x2d, 0x2d]);
  const record = {
    evidenceId: 'evidence-1', projectId: 'p', runId: 'r', taskId: 't', attemptId: 'a', ownershipGeneration: 1, kind: 'log', inputArtifacts: [],
    codeRevision: 'c', validator: { name: 'v', version: '1' }, outcome: 'ok', contentDigest: `sha256:${'ab'.repeat(32)}`,
    contentType: 'application/octet-stream', sizeBytes: content.length, capturedAt: '2026-10-25T09:00:00.000Z',
  };
  const stored = { ...record, producer: { kind: 'worker', workerId: 'worker-1' }, ownershipCurrent: true, publishedAt: '2026-10-25T09:00:01.000Z' };
  const part = (name: string, type: string, bytes: Buffer) =>
    Buffer.concat([Buffer.from(`--b0undary\r\nContent-Disposition: form-data; name="${name}"\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from('\r\n')]);
  const body = (...parts: Buffer[]) => Buffer.concat([Buffer.from('preamble\r\n'), ...parts, Buffer.from('--b0undary--\r\n')]);
  const recordPart = part('record', 'application/json', Buffer.from(JSON.stringify(record)));
  const contentPart = part('content', 'application/octet-stream', content);
  const post = async (payload: Buffer, contentType = 'multipart/form-data; boundary=b0undary', bearer = WORKER) => {
    const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': contentType }, body: new Uint8Array(payload) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };

  answer = () => ok(stored);
  assert.equal((await post(body(recordPart, contentPart))).status, 201);
  assert.deepEqual([uploads[0]?.record, [...(uploads[0]?.content ?? [])]], [record, [...content]]);
  answer = () => ok(new StatusAnswer(200, stored));
  assert.equal((await post(body(contentPart, recordPart), 'multipart/form-data; charset=utf-8; boundary="b0undary"')).status, 200);
  answer = () => err(failure('forbidden', 'never held', { reason: 'producer-not-authorized' }));
  assert.equal((await post(body(recordPart, contentPart))).status, 403);
  answer = () => err(failure('forbidden', 'revoked meanwhile', { reason: 'worker-not-authorized' }));
  assert.equal((await post(body(recordPart, contentPart))).status, 401);
  answer = () => err(failure('conflict', 'other values'));
  assert.equal((await post(body(recordPart, contentPart))).status, 409);
  assert.equal((await post(body(recordPart, contentPart), 'multipart/form-data; boundary=b0undary', OPERATOR)).status, 401);

  const handled = uploads.length;
  const invalid = [
    [body(recordPart), undefined],
    [body(recordPart, contentPart, part('extra', 'text/plain', Buffer.from('x'))), undefined],
    [body(recordPart, recordPart), undefined],
    [body(part('record', 'application/json', Buffer.from('{')), contentPart), undefined],
    [body(part('record', 'application/json', Buffer.from('{}')), contentPart), undefined],
    [body(recordPart, contentPart), 'application/json'],
    [Buffer.from('no boundary at all'), undefined],
    [Buffer.from('--b0undary\r\nContent-Disposition: form-data; name="record"\r\n\r\n{}'), undefined],
    [Buffer.from('--b0undary\r\nContent-Disposition: form-data; name="record"'), undefined],
    [Buffer.from('--b0undaryXX'), undefined],
    [Buffer.from('--b0undary\r\nnot a header\r\n\r\n{}\r\n--b0undary--'), undefined],
    [Buffer.from('--b0undary\r\nContent-Type: text/plain\r\n\r\n{}\r\n--b0undary--'), undefined],
    [body(part('record', 'application/json', Buffer.alloc(1024 ** 2 + 1, 0x20)), contentPart), undefined],
    [body(recordPart, part('content', 'application/octet-stream', Buffer.alloc(64 * 1024 ** 2 + 1))), undefined],
    [Buffer.alloc(65 * 1024 ** 2 + 1), undefined],
  ] as const;
  for (const [payload, contentType] of invalid) {
    const refused = await post(payload, contentType);
    assert.deepEqual([refused.status, refused.body.code], [400, 'invalid'], payload.subarray(0, 60).toString());
  }
  assert.equal(uploads.length, handled, 'no invalid upload reaches the operation');
});

test('evidence uploads beyond the concurrency limit wait for a free slot', async () => {
  const WORKER = `tkwk_${'E'.repeat(43)}`;
  const started: number[] = [];
  const releases: (() => void)[] = [];
  const slotServer = createApiServer({
    ...handlers,
    authenticateWorker: async () => ok({ workerId: 'worker-1' as never, generation: 1 }),
    handle: async () => {
      started.push(Date.now());
      await new Promise<void>((resolve) => releases.push(resolve));
      return err(failure('conflict', 'stop here'));
    },
  }, { maxConcurrentUploads: 1 });
  await new Promise<void>((resolve) => slotServer.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => slotServer.close(() => resolve())));
  const record = {
    evidenceId: 'e', projectId: 'p', runId: 'r', taskId: 't', attemptId: 'a', ownershipGeneration: 1, kind: 'log', inputArtifacts: [],
    codeRevision: 'c', validator: { name: 'v', version: '1' }, outcome: 'ok', contentDigest: `sha256:${'ab'.repeat(32)}`,
    contentType: 'text/plain', sizeBytes: 1, capturedAt: '2026-10-25T09:00:00.000Z',
  };
  const upload = () => {
    const form = new FormData();
    form.append('record', new Blob([JSON.stringify(record)], { type: 'application/json' }));
    form.append('content', new Blob(['x']));
    const port = (slotServer.address() as AddressInfo).port;
    return fetch(`http://127.0.0.1:${port}/evidence`, { method: 'POST', headers: { authorization: `Bearer ${WORKER}` }, body: form });
  };
  const waitFor = async (condition: () => boolean) => {
    while (!condition()) await new Promise((resolve) => setTimeout(resolve, 10));
  };
  const first = upload();
  const second = upload();
  await waitFor(() => started.length === 1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(started.length, 1, 'the second upload waits while the first holds the only slot');
  releases[0]!();
  await waitFor(() => started.length === 2);
  releases[1]!();
  assert.deepEqual([(await first).status, (await second).status], [409, 409]);
});

test('authorizeLaunch maps every outcome to its contract shape, and needs a worker principal', async () => {
  const parameters = value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));
  const grant = {
    launchAuthId: 'launch-1', operationId: 'operation-1', executionId: 'execution-1', assignmentId: 'assignment-1', attemptId: 'attempt-1',
    workerId: 'worker-1', ownershipGeneration: 1, recoveryEpoch: 1, admissionId: 'admission-1', admissionGeneration: 2, reliedOnGates: [],
    artifacts: [], policyRevision: 'policy-1', issuedAt: '2026-10-25T09:00:00.000Z', parameters, state: 'granted',
  } as unknown as LaunchGrant;
  const outcomes: LaunchOutcome[] = [
    { kind: 'granted', grant },
    { kind: 'rejected', rejection: { reason: 'unavailable', retryable: true, message: 'later' } },
    { kind: 'revoked', reason: 'gate-not-passed' },
    { kind: 'expired' },
  ];
  let next = 0;
  const api = new ControlPlaneApi({
    sessions: undefined as never, authorization: undefined as never, runProjects: undefined as never,
    installationCa: undefined as never, runs: undefined as never, tasks: undefined as never, evidence: undefined as never, operator: undefined as never, enrollment: undefined as never,
    quarantine: undefined as never, delegations: undefined as never,
    launches: { authorize: async () => ok(outcomes[next++]!) },
  });
  const body = {
    operationId: 'operation-1', recoveryEpoch: 1, assignmentId: 'assignment-1', attemptId: 'attempt-1', ownershipGeneration: 1,
    executionId: 'execution-1', admissionId: 'admission-1', admissionGeneration: 2, reportsNotStarted: false,
  };
  const request = { parameters: [], body, query: new URLSearchParams(), correlationId: 'c' as never, worker: { workerId: 'worker-1' as never, generation: 1 } };
  const answers = [];
  for (let index = 0; index < outcomes.length; index += 1) answers.push(value(await api.handle('authorizeLaunch', request, '')) as { outcome: string });
  assert.deepEqual(answers.map((answer) => answer.outcome), ['granted', 'rejected', 'revoked', 'expired']);
  for (const answer of answers) assert.ok(checkHttpSchema('LaunchAuthorizationOutcome', answer).ok, JSON.stringify(answer));
  assert.deepEqual((answers[0] as unknown as { grant: Record<string, unknown> }).grant.ttlMilliseconds, 30_000);
  const { worker: _worker, ...anonymous } = request;
  assert.equal(failed(await api.handle('authorizeLaunch', anonymous, '')).code, 'internal');
  assert.equal(failed(await api.handle('authorizeLaunch', { ...request, body: { ...body, recoveryEpoch: 0 } }, '')).code, 'invalid');
});

test('a refused renewal is logged with its worker, generation, code, and reason, and never its key or hash', async () => {
  const renewalSink = new InMemoryLogSink();
  const failures = [
    failure('conflict', 'another key or hash', { reason: 'renewal-mismatch' }),
    failure('forbidden', 'the worker is not authorized', { reason: 'worker-not-authorized' }),
    failure('unavailable', 'the database is down'),
  ];
  const api = new ControlPlaneApi({
    installationCa: undefined as never, runs: undefined as never, tasks: undefined as never, evidence: undefined as never, operator: undefined as never,
    quarantine: undefined as never, delegations: undefined as never, launches: undefined as never,
    enrollment: { renew: async () => err(failures.shift()!) } as never,
  }, new Logger(renewalSink, { now: () => '2026-10-25T09:00:00.000Z' as never }));
  const body = { credentialGeneration: 2, brokerUserPublicKey: `U${'K'.repeat(55)}`, controlPlaneSecretSha256: 'a'.repeat(64) };
  const request = { parameters: [], body, query: new URLSearchParams(), correlationId: 'c' as never, worker: { workerId: 'worker-1' as never, generation: 1 } };
  const codes = [];
  for (let call = 0; call < 3; call += 1) codes.push(failed(await api.handle('renewWorkerCredentials', request, '')).code);
  assert.deepEqual(codes, ['conflict', 'forbidden', 'unavailable'], 'the failures pass unchanged');
  assert.deepEqual(renewalSink.records.map(({ level, event, correlation, fields }) => ({ level, event, correlation, fields })), [
    { level: 'warn', event: 'fleet.credentials.renewal-refused', correlation: { workerId: 'worker-1' }, fields: { generation: 2, code: 'conflict', reason: 'renewal-mismatch' } },
    { level: 'warn', event: 'fleet.credentials.renewal-refused', correlation: { workerId: 'worker-1' }, fields: { generation: 2, code: 'forbidden', reason: 'worker-not-authorized' } },
  ], 'an unavailable store refuses nothing');
  assert.doesNotMatch(JSON.stringify(renewalSink.records), /KKKK|aaaa/);
});

test('authorizeLaunch passes the reported sealed executions to the authority and refuses an invalid list', async () => {
  const received: unknown[] = [];
  const api = new ControlPlaneApi({
    sessions: undefined as never, authorization: undefined as never, runProjects: undefined as never,
    installationCa: undefined as never, runs: undefined as never, tasks: undefined as never, evidence: undefined as never, operator: undefined as never, enrollment: undefined as never,
    quarantine: undefined as never, delegations: undefined as never,
    launches: { authorize: async (_principal, values) => {
      received.push(values);
      return ok({ kind: 'expired' });
    } },
  });
  const sealed = (index: number) => ({ executionId: `execution-${index}`, operationId: `operation-${index}` });
  const limit = Array.from({ length: REPORTED_SEALS_LIMIT }, (_, index) => sealed(index + 1));
  const body = {
    operationId: 'operation-9', recoveryEpoch: 1, assignmentId: 'assignment-1', attemptId: 'attempt-1', ownershipGeneration: 1,
    executionId: 'execution-9', admissionId: 'admission-1', admissionGeneration: 2, reportsNotStarted: false,
    reportsNotStartedFor: limit,
  };
  assert.ok(checkHttpSchema('LaunchAuthorizationRequest', body).ok);
  const request = { parameters: [], body, query: new URLSearchParams(), correlationId: 'c' as never, worker: { workerId: 'worker-1' as never, generation: 1 } };
  value(await api.handle('authorizeLaunch', request, ''));
  const { reportsNotStartedFor: _sealed, ...unreported } = body;
  value(await api.handle('authorizeLaunch', { ...request, body: unreported }, ''));
  assert.deepEqual(received.map((values) => (values as { reportsNotStartedFor?: unknown }).reportsNotStartedFor), [limit, undefined]);
  const invalid = [[], [...limit, sealed(9)], [{ executionId: '', operationId: 'operation-1' }], [sealed(1), { executionId: 'execution-2', operationId: '' }]];
  assert.equal(checkHttpSchema('LaunchAuthorizationRequest', { ...body, reportsNotStartedFor: invalid[1] }).ok, false);
  for (const reportsNotStartedFor of invalid) {
    assert.equal(failed(await api.handle('authorizeLaunch', { ...request, body: { ...body, reportsNotStartedFor } }, '')).code, 'invalid');
  }
  assert.equal(received.length, 2);
});

test('an undecided launch operation is 503, never 500', async () => {
  const launchServer = createApiServer({
    ...handlers,
    authenticateWorker: async () => ok({ workerId: 'worker-1' as never, generation: 1 }),
    handle: async () => err(failure('internal', 'the index lost a grant')),
  });
  await new Promise<void>((resolve) => launchServer.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => launchServer.close(() => resolve())));
  const body = {
    operationId: 'operation-1', recoveryEpoch: 1, assignmentId: 'assignment-1', attemptId: 'attempt-1', ownershipGeneration: 1,
    executionId: 'execution-1', admissionId: 'admission-1', admissionGeneration: 1, reportsNotStarted: false,
  };
  const response = await fetch(`http://127.0.0.1:${(launchServer.address() as AddressInfo).port}/launch-authorizations`, {
    method: 'POST', headers: { authorization: `Bearer tkwk_${'F'.repeat(43)}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 503);
});

test('a delegation while the database is down is 503 with a Failure', async () => {
  const down = { transaction: async () => err(failure('unavailable', 'the database is down')) } as unknown as ControlPlaneStore;
  const api = new ControlPlaneApi({
    sessions: undefined as never, authorization: undefined as never, runProjects: undefined as never,
    installationCa: undefined as never, runs: undefined as never, tasks: undefined as never, evidence: undefined as never, operator: undefined as never, enrollment: undefined as never,
    quarantine: undefined as never, launches: undefined as never, delegations: new DelegationService(down),
  });
  const delegationServer = createApiServer({
    ...handlers,
    authenticateWorker: async () => ok({ workerId: 'worker-1' as never, generation: 1 }),
    handle: (operationId, request, bearer) => api.handle(operationId, request, bearer),
  });
  await new Promise<void>((resolve) => delegationServer.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => delegationServer.close(() => resolve())));
  const body = {
    delegationId: 'delegation-1', attemptId: 'attempt-1', ownershipGeneration: 2, runId: 'run-1',
    child: { taskId: 'task-child', kind: 'planning', stageId: 'specs' },
  };
  const response = await fetch(`http://127.0.0.1:${(delegationServer.address() as AddressInfo).port}/delegations`, {
    method: 'POST', headers: { authorization: `Bearer tkwk_${'F'.repeat(43)}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const answer: unknown = await response.json();
  assert.equal(response.status, 503);
  assert.ok(checkHttpSchema('Failure', answer).ok, JSON.stringify(answer));
});
