import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { ControlPlaneApi, ROUTES, createApiServer, type ApiHandlers, type ApiRequest, type RouteDefinition } from '@taskelith/control-plane';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';

const OPERATOR = `tkop_${'A'.repeat(43)}`;
const sink = new InMemoryLogSink();
let answers: Record<string, () => Result<unknown>> = {};

// Handlers that answer what each test sets, behind the real server.
let storeDown = false;
const handlers: ApiHandlers = {
  authenticateOperator: async (secret) => {
    if (storeDown) return err(failure('unavailable', 'the credential store is down'));
    return secret === OPERATOR ? ok(undefined) : err(failure('forbidden', 'not the operator'));
  },
  authenticateWorker: async () => err(failure('forbidden', 'no worker in these tests')),
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

test('a redrive sequence that is not a positive safe integer is 400 before the broker', async () => {
  let redriven = 0;
  const api = new ControlPlaneApi({
    runs: undefined as never, tasks: undefined as never, operator: { authenticate: async () => ok(undefined) },
    enrollment: undefined as never,
    quarantine: { records: async () => ok([]), redrive: async () => (redriven++, ok(null)) },
  });
  for (const sequence of ['0', '9007199254740993']) {
    const outcome = await api.handle('redriveQuarantined', { parameters: [sequence], body: undefined, query: new URLSearchParams(), correlationId: 'c' as never }, '');
    assert.equal(!outcome.ok && outcome.error.code, 'invalid');
  }
  assert.equal(redriven, 0);
  assert.deepEqual(await api.handle('redriveQuarantined', { parameters: ['7'], body: undefined, query: new URLSearchParams(), correlationId: 'c' as never }, ''), ok({ sequence: 7 }));
});

test('a worker route reaches its operation with the principal of a valid worker bearer only, whatever it declares', async () => {
  const WORKER = `tkwk_${'B'.repeat(43)}`;
  const probe: RouteDefinition = {
    operationId: 'probeWorker', method: 'GET', pattern: /^\/probe$/, security: 'workerCredential', response: 'TaskResult', success: 200,
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
    runs: undefined as never, tasks: undefined as never, operator: undefined as never, quarantine: undefined as never,
    enrollment: { enroll: undefined as never, authenticateWorkerBearer: async (secret) => (secret === 'tkwk_x' ? ok(principal) : err(failure('forbidden', 'no'))) },
  });
  assert.deepEqual(await api.authenticateWorker('tkwk_x'), ok(principal));
  assert.equal((await api.authenticateWorker('tkwk_y')).ok, false);
});
