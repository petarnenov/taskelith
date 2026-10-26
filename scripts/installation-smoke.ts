import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// The operator's side of make installation-smoke: creates a run of the smoke
// workflow, submits one planning task, and waits for its stored result.

export const SMOKE_RUN = 'installation-smoke-run';
export const SMOKE_TASK = 'installation-smoke-task';
const SMOKE_PROJECT = 'installation-smoke-project';
const SMOKE_STAGE = 'specs';
export const RESULT_DEADLINE_MILLISECONDS = 120_000;
export const POLL_MILLISECONDS = 1_000;
export const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

export interface SmokeWorkflow {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
}

export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

// The control-plane operations the smoke calls, as the operator does.
export interface OperatorApi {
  post(path: string, body: unknown): Promise<Answer>;
  get(path: string): Promise<Answer>;
}

export interface SmokeClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export class SmokeFailure extends Error {}

// The first workflow of a TASKELITH_WORKFLOWS file, which the run binds.
export function readSmokeWorkflow(path: string): SmokeWorkflow {
  const [entry] = JSON.parse(readFileSync(path, 'utf8')) as { definition: { id: string; version: string }; digest: string }[];
  if (entry === undefined) throw new SmokeFailure(`${path} lists no workflow`);
  return { id: entry.definition.id, version: entry.definition.version, digest: entry.digest };
}

export function httpOperatorApi(baseUrl: string, operatorToken: string): OperatorApi {
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    return { status: response.status, body: parsedBody(await response.text()) };
  };
  return { post: (path, body) => call('POST', path, body), get: (path) => call('GET', path) };
}

// A body that is not JSON, such as a proxy's error page, stays its text.
export function parsedBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// Returns the ended task result once its attempt exited with code 0.
export async function runSmoke(api: OperatorApi, workflow: SmokeWorkflow, clock: SmokeClock): Promise<unknown> {
  await expectStatus(api.post('/runs', { runId: SMOKE_RUN, projectId: SMOKE_PROJECT, binding: bindingOf(workflow) }), 201, 'creating the run');
  await expectStatus(api.post(`/runs/${SMOKE_RUN}/tasks`, { taskId: SMOKE_TASK, kind: 'planning', stageId: SMOKE_STAGE }), 201, 'submitting the task');
  const result = await awaitEndedResult(api, clock);
  if (!exitedWithZero(result)) throw new SmokeFailure(`the task did not exit with code 0: ${JSON.stringify(result)}`);
  return result;
}

function bindingOf(workflow: SmokeWorkflow): Record<string, string> {
  return {
    pluginId: 'openspec', pluginVersion: 'installation-smoke', upstreamToolVersion: 'installation-smoke',
    workflowId: workflow.id, workflowVersion: workflow.version, workflowDigest: workflow.digest,
    configurationRevision: 'installation-smoke', policyRevision: 'installation-smoke',
  };
}

async function expectStatus(answer: Promise<Answer>, status: number, step: string): Promise<Answer> {
  const answered = await answer;
  if (answered.status !== status) throw new SmokeFailure(`${step} answered ${answered.status}: ${JSON.stringify(answered.body)}`);
  return answered;
}

async function awaitEndedResult(api: OperatorApi, clock: SmokeClock): Promise<unknown> {
  const deadline = clock.now() + RESULT_DEADLINE_MILLISECONDS;
  for (;;) {
    const { body } = await expectStatus(api.get(`/runs/${SMOKE_RUN}/tasks/${SMOKE_TASK}/result`), 200, 'reading the result');
    if ((body as { state?: unknown }).state === 'ended') return body;
    if (clock.now() >= deadline) throw new SmokeFailure(`the task did not end within ${RESULT_DEADLINE_MILLISECONDS} ms`);
    await clock.sleep(POLL_MILLISECONDS);
  }
}

function exitedWithZero(result: unknown): boolean {
  const { outcome } = result as { outcome?: { kind?: unknown; status?: { kind?: unknown; code?: unknown }; startProven?: unknown } };
  return outcome?.kind === 'exited' && outcome.status?.kind === 'code' && outcome.status.code === 0 && outcome.startProven === true;
}

const SYSTEM_SMOKE_CLOCK: SmokeClock = { now: Date.now, sleep: (milliseconds) => delay(milliseconds) };

// usage: installation-smoke.ts API_URL WORKFLOWS_FILE, with the operator
// secret in TASKELITH_OPERATOR_TOKEN.
if (import.meta.main) {
  const [baseUrl, workflows] = process.argv.slice(2);
  const token = process.env.TASKELITH_OPERATOR_TOKEN;
  try {
    if (baseUrl === undefined || workflows === undefined || !token) throw new SmokeFailure('usage: installation-smoke.ts API_URL WORKFLOWS_FILE');
    const result = await runSmoke(httpOperatorApi(baseUrl, token), readSmokeWorkflow(workflows), SYSTEM_SMOKE_CLOCK);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`installation-smoke: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
