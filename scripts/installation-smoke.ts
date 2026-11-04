import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// The operator's side of make installation-smoke: creates a project and a
// run of the smoke workflow, submits a task, and waits for its result.

export const SMOKE_RUN = 'installation-smoke-run';
export const SMOKE_TASK = 'installation-smoke-task';
const SMOKE_PROJECT_NAME = 'Installation smoke';
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
  put(path: string, body: unknown): Promise<Answer>;
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
  const call = async (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Answer> => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    return { status: response.status, body: parsedBody(await response.text()) };
  };
  return { post: (path, body) => call('POST', path, body), put: (path, body) => call('PUT', path, body), get: (path) => call('GET', path) };
}

// A body that is not JSON, such as a proxy's error page, stays its text.
export function parsedBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// A submitted task: its run binds the smoke workflow.
export interface SmokeTask {
  readonly runId: string;
  readonly taskId: string;
}

const SMOKE: SmokeTask = { runId: SMOKE_RUN, taskId: SMOKE_TASK };

// The project defaults that createProject requires; the smoke reads none.
const PROJECT_DEFAULTS = {
  framework: { pluginId: 'sdlc-openspec' }, implementers: ['agent-primary'], reviewer: 'agent-secondary',
  specApprover: 'project-maintainer', noEligibleSlot: 'wait',
};

// Returns the ended task result once its attempt exited with code 0.
export async function runSmoke(api: OperatorApi, workflow: SmokeWorkflow, ownerPrincipalId: string, clock: SmokeClock): Promise<unknown> {
  const projectId = await createOperatedProject(api, ownerPrincipalId, SMOKE_PROJECT_NAME);
  await submitTask(api, workflow, SMOKE, projectId);
  return awaitExitedWithZero(api, SMOKE, clock);
}

// A run needs an existing project and its operator role, which the owner
// does not get by creating it (control-plane wire contracts section 3).
export async function createOperatedProject(api: OperatorApi, ownerPrincipalId: string, name: string): Promise<string> {
  const created = await expectStatus(api.post('/projects', { name, defaults: PROJECT_DEFAULTS }), 201, 'creating the project');
  const { projectId } = created.body as { projectId?: unknown };
  if (typeof projectId !== 'string') throw new SmokeFailure(`creating the project answered no projectId: ${JSON.stringify(created.body)}`);
  const member = `/projects/${projectId}/members/${encodeURIComponent(ownerPrincipalId)}`;
  await expectStatus(api.put(member, { role: 'project-operator' }), 200, 'assigning the owner project-operator');
  return projectId;
}

// Creates the task's run in the project and submits the task.
export async function submitTask(api: OperatorApi, workflow: SmokeWorkflow, task: SmokeTask, projectId: string): Promise<void> {
  await expectStatus(api.post('/runs', { runId: task.runId, projectId, binding: bindingOf(workflow) }), 201, 'creating the run');
  await expectStatus(api.post(`/runs/${task.runId}/tasks`, { taskId: task.taskId, kind: 'planning', stageId: SMOKE_STAGE }), 201, 'submitting the task');
}

export async function awaitExitedWithZero(api: OperatorApi, task: SmokeTask, clock: SmokeClock): Promise<unknown> {
  const result = await awaitEndedResult(api, task, clock);
  if (!exitedWithZero(result)) throw new SmokeFailure(`the task did not exit with code 0: ${JSON.stringify(result)}`);
  return result;
}

export function resultPath(task: SmokeTask): string {
  return `/runs/${task.runId}/tasks/${task.taskId}/result`;
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

async function awaitEndedResult(api: OperatorApi, task: SmokeTask, clock: SmokeClock): Promise<unknown> {
  const deadline = clock.now() + RESULT_DEADLINE_MILLISECONDS;
  for (;;) {
    const { body } = await expectStatus(api.get(resultPath(task)), 200, 'reading the result');
    if ((body as { state?: unknown }).state === 'ended') return body;
    if (clock.now() >= deadline) throw new SmokeFailure(`the task did not end within ${RESULT_DEADLINE_MILLISECONDS} ms`);
    await clock.sleep(POLL_MILLISECONDS);
  }
}

function exitedWithZero(result: unknown): boolean {
  const { outcome } = result as { outcome?: { kind?: unknown; status?: { kind?: unknown; code?: unknown }; startProven?: unknown } };
  return outcome?.kind === 'exited' && outcome.status?.kind === 'code' && outcome.status.code === 0 && outcome.startProven === true;
}

export const SYSTEM_SMOKE_CLOCK: SmokeClock = { now: Date.now, sleep: (milliseconds) => delay(milliseconds) };

export const SMOKE_USAGE = 'usage: installation-smoke.ts API_URL WORKFLOWS_FILE'
  + ' with TASKELITH_OPERATOR_TOKEN and TASKELITH_OWNER_PRINCIPAL_ID';

// usage: installation-smoke.ts API_URL WORKFLOWS_FILE, with the operator
// secret and the owner's principal in the environment that init filled.
if (import.meta.main) {
  const [baseUrl, workflows] = process.argv.slice(2);
  const token = process.env.TASKELITH_OPERATOR_TOKEN;
  const owner = process.env.TASKELITH_OWNER_PRINCIPAL_ID;
  try {
    if (baseUrl === undefined || workflows === undefined || !token || !owner) throw new SmokeFailure(SMOKE_USAGE);
    const result = await runSmoke(httpOperatorApi(baseUrl, token), readSmokeWorkflow(workflows), owner, SYSTEM_SMOKE_CLOCK);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`installation-smoke: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
