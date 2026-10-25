import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { ControlPlaneApi, createApiServer, type ApiHandlers } from '@taskelith/control-plane';
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
