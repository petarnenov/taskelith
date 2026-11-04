import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { readControlPlaneSettings } from '@taskelith/control-plane';
import { checkHttpSchema } from '@taskelith/contracts';
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
const OWNER = `u${'1'.repeat(32)}`;
const PROJECT = `p${'2'.repeat(32)}`;
const MEMBER_PATH = `/projects/${PROJECT}/members/${OWNER}`;

// Answers creation with 201 and the minted project, an assignment with 200,
// a step named in `refused` with its status, and each result read in turn.
class ScriptedApi implements OperatorApi {
  readonly posts: { path: string; body: unknown }[] = [];
  readonly puts: { path: string; body: unknown }[] = [];
  readonly #results: Answer[];
  readonly #refused: Readonly<Record<string, Answer>>;

  constructor(results: readonly unknown[], refused: Readonly<Record<string, Answer>> = {}) {
    this.#results = results.map((body) => ({ status: 200, body }));
    this.#refused = refused;
  }

  post(path: string, body: unknown): Promise<Answer> {
    this.posts.push({ path, body });
    const created = path === '/projects' ? { status: 201, body: { projectId: PROJECT } } : { status: 201, body: {} };
    return Promise.resolve(this.#refused[path] ?? created);
  }

  put(path: string, body: unknown): Promise<Answer> {
    this.puts.push({ path, body });
    return Promise.resolve(this.#refused[path] ?? { status: 200, body: {} });
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

test('the smoke creates a project with the owner as its operator, a run in it, and a task, and returns its ended result', async () => {
  const api = new ScriptedApi([PENDING, PENDING, ended(EXITED)]);
  const clock = manualClock();
  assert.deepEqual(await runSmoke(api, WORKFLOW, OWNER, clock), ended(EXITED));
  assert.deepEqual(api.posts.map(({ path }) => path), ['/projects', '/runs', `/runs/${SMOKE_RUN}/tasks`]);
  assert.equal((api.posts[0]?.body as { name: string }).name, 'Installation smoke');
  assert.deepEqual(api.puts, [{ path: MEMBER_PATH, body: { role: 'project-operator' } }]);
  const run = api.posts[1]?.body as { projectId: string; binding: Record<string, string> };
  assert.equal(run.projectId, PROJECT);
  assert.deepEqual([run.binding.workflowId, run.binding.workflowVersion, run.binding.workflowDigest], [WORKFLOW.id, WORKFLOW.version, WORKFLOW.digest]);
  assert.deepEqual(api.posts[2]?.body, { taskId: SMOKE_TASK, kind: 'planning', stageId: 'specs' });
  assert.equal(clock.slept, 2 * POLL_MILLISECONDS);
});

test('the smoke project is valid for createProject and its assignment for assignProjectMember', async () => {
  const api = new ScriptedApi([ended(EXITED)]);
  await runSmoke(api, WORKFLOW, OWNER, manualClock());
  assert.ok(checkHttpSchema('ProjectCreation', api.posts[0]?.body).ok);
  assert.ok(checkHttpSchema('MemberAssignment', api.puts[0]?.body).ok);
});

test('the smoke fails on an exit other than code 0 or an unproven start', async () => {
  for (const outcome of [
    { ...EXITED, status: { kind: 'code', code: 1 } },
    { ...EXITED, status: { kind: 'signal', signal: 'SIGKILL' } },
    { ...EXITED, startProven: false },
    { kind: 'not-started' },
  ]) {
    await assert.rejects(runSmoke(new ScriptedApi([ended(outcome)]), WORKFLOW, OWNER, manualClock()), SmokeFailure, JSON.stringify(outcome));
  }
});

test('the smoke fails when a step is refused or the task does not end in time', async () => {
  const refusals: readonly [string, number, RegExp][] = [
    ['/projects', 403, /creating the project answered 403/],
    [MEMBER_PATH, 404, /assigning the owner project-operator answered 404/],
    ['/runs', 422, /creating the run answered 422/],
  ];
  for (const [path, status, message] of refusals) {
    await assert.rejects(runSmoke(new ScriptedApi([], { [path]: { status, body: {} } }), WORKFLOW, OWNER, manualClock()), message);
  }
  const unnamed = new ScriptedApi([], { '/projects': { status: 201, body: {} } });
  await assert.rejects(runSmoke(unnamed, WORKFLOW, OWNER, manualClock()), /creating the project answered no projectId/);
  await assert.rejects(runSmoke(new ScriptedApi([]), WORKFLOW, OWNER, manualClock()), /reading the result answered 404/);
  const always = new ScriptedApi(Array.from({ length: RESULT_DEADLINE_MILLISECONDS / POLL_MILLISECONDS + 2 }, () => PENDING));
  await assert.rejects(runSmoke(always, WORKFLOW, OWNER, manualClock()), /did not end within/);
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
  assert.deepEqual((await api.put('/projects/p/members/u', { role: 'project-operator' })).status, 201);
  assert.deepEqual((await api.get('/runs/r')).status, 201);
  assert.deepEqual(seen, [
    { method: 'POST', url: '/runs', authorization: 'Bearer tkop_test', body: '{"runId":"r"}' },
    { method: 'PUT', url: '/projects/p/members/u', authorization: 'Bearer tkop_test', body: '{"role":"project-operator"}' },
    { method: 'GET', url: '/runs/r', authorization: 'Bearer tkop_test', body: '' },
  ]);
});

test('a body that is not JSON keeps its status and text', () => {
  assert.deepEqual(parsedBody('{"code":"invalid"}'), { code: 'invalid' });
  assert.equal(parsedBody('<html>Bad Gateway</html>'), '<html>Bad Gateway</html>');
  assert.equal(parsedBody(''), '');
});
