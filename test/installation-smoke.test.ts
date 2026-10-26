import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { readControlPlaneSettings } from '@taskelith/control-plane';
import { value } from '@taskelith/testing';
import {
  httpOperatorApi,
  parsedBody,
  POLL_MILLISECONDS,
  readSmokeWorkflow,
  RESULT_DEADLINE_MILLISECONDS,
  runSmoke,
  SMOKE_RUN,
  SMOKE_TASK,
  SmokeFailure,
  type Answer,
  type OperatorApi,
  type SmokeClock,
} from '../scripts/installation-smoke.ts';

const WORKFLOWS = 'infra/installation/smoke/workflows.json';
const WORKFLOW = { id: 'smoke', version: '1', digest: `sha256:${'ab'.repeat(32)}` };
const RESULT_PATH = `/runs/${SMOKE_RUN}/tasks/${SMOKE_TASK}/result`;
const PENDING = { state: 'pending', runId: SMOKE_RUN, taskId: SMOKE_TASK };

function ended(outcome: Record<string, unknown>): Record<string, unknown> {
  return { state: 'ended', runId: SMOKE_RUN, taskId: SMOKE_TASK, attemptId: 'a', ownershipGeneration: 1, outcome, evidence: [] };
}

const EXITED = { kind: 'exited', status: { kind: 'code', code: 0 }, startProven: true };

// Answers creation with 201 and each result read with the next answer.
class ScriptedApi implements OperatorApi {
  readonly posts: { path: string; body: unknown }[] = [];
  readonly #results: Answer[];
  readonly #created: number;

  constructor(results: readonly unknown[], created = 201) {
    this.#results = results.map((body) => ({ status: 200, body }));
    this.#created = created;
  }

  post(path: string, body: unknown): Promise<Answer> {
    this.posts.push({ path, body });
    return Promise.resolve({ status: this.#created, body: {} });
  }

  get(path: string): Promise<Answer> {
    assert.equal(path, RESULT_PATH);
    return Promise.resolve(this.#results.shift() ?? { status: 404, body: {} });
  }
}

function manualClock(): SmokeClock & { slept: number } {
  let now = 0;
  return {
    slept: 0,
    now: () => now,
    sleep(milliseconds) {
      now += milliseconds;
      this.slept += milliseconds;
      return Promise.resolve();
    },
  };
}

test('the smoke creates a run, submits a task, and returns its ended result', async () => {
  const api = new ScriptedApi([PENDING, PENDING, ended(EXITED)]);
  const clock = manualClock();
  assert.deepEqual(await runSmoke(api, WORKFLOW, clock), ended(EXITED));
  assert.deepEqual(api.posts.map(({ path }) => path), ['/runs', `/runs/${SMOKE_RUN}/tasks`]);
  const binding = (api.posts[0]?.body as { binding: Record<string, string> }).binding;
  assert.deepEqual([binding.workflowId, binding.workflowVersion, binding.workflowDigest], [WORKFLOW.id, WORKFLOW.version, WORKFLOW.digest]);
  assert.deepEqual(api.posts[1]?.body, { taskId: SMOKE_TASK, kind: 'planning', stageId: 'specs' });
  assert.equal(clock.slept, 2 * POLL_MILLISECONDS);
});

test('the smoke fails on an exit other than code 0 or an unproven start', async () => {
  for (const outcome of [
    { ...EXITED, status: { kind: 'code', code: 1 } },
    { ...EXITED, status: { kind: 'signal', signal: 'SIGKILL' } },
    { ...EXITED, startProven: false },
    { kind: 'not-started' },
  ]) {
    await assert.rejects(runSmoke(new ScriptedApi([ended(outcome)]), WORKFLOW, manualClock()), SmokeFailure, JSON.stringify(outcome));
  }
});

test('the smoke fails when a step is refused or the task does not end in time', async () => {
  await assert.rejects(runSmoke(new ScriptedApi([], 422), WORKFLOW, manualClock()), /creating the run answered 422/);
  await assert.rejects(runSmoke(new ScriptedApi([]), WORKFLOW, manualClock()), /reading the result answered 404/);
  const always = new ScriptedApi(Array.from({ length: RESULT_DEADLINE_MILLISECONDS / POLL_MILLISECONDS + 2 }, () => PENDING));
  await assert.rejects(runSmoke(always, WORKFLOW, manualClock()), /did not end within/);
});

test('the smoke workflow is valid for the control plane and its digest is of its definition', () => {
  const [entry] = JSON.parse(readFileSync(WORKFLOWS, 'utf8')) as { definition: unknown; digest: string }[];
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(entry?.definition)).digest('hex')}`;
  assert.deepEqual(readSmokeWorkflow(WORKFLOWS), { id: 'installation-smoke', version: '1', digest });
  const environment = {
    TASKELITH_POSTGRES_URL: 'postgres://u:p@127.0.0.1/taskelith', TASKELITH_NATS_URL: 'nats://127.0.0.1:4222',
    TASKELITH_DATA_DIR: '/var/lib/taskelith', TASKELITH_WORKFLOWS: WORKFLOWS,
  };
  const [known] = value(readControlPlaneSettings(environment, 'linux', 10001)).workflows;
  assert.deepEqual([known?.definition.id, known?.digest], ['installation-smoke', digest]);
});

test('the HTTP adapter sends the operator bearer and JSON bodies', async (t) => {
  const seen: { method?: string; url?: string; authorization?: string; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
      response.writeHead(201, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const api = httpOperatorApi(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'tkop_test');
  assert.deepEqual(await api.post('/runs', { runId: 'r' }), { status: 201, body: { ok: true } });
  assert.deepEqual((await api.get('/runs/r')).status, 201);
  assert.deepEqual(seen, [
    { method: 'POST', url: '/runs', authorization: 'Bearer tkop_test', body: '{"runId":"r"}' },
    { method: 'GET', url: '/runs/r', authorization: 'Bearer tkop_test', body: '' },
  ]);
});

test('a body that is not JSON keeps its status and text', () => {
  assert.deepEqual(parsedBody('{"code":"invalid"}'), { code: 'invalid' });
  assert.equal(parsedBody('<html>Bad Gateway</html>'), '<html>Bad Gateway</html>');
  assert.equal(parsedBody(''), '');
});
