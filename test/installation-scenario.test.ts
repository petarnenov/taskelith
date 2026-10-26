import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScenarioRecorder, ScenarioRun } from '@taskelith/testing';
import {
  parseScenarioCommand,
  resultSummary,
  runScenarioCommand,
  scenarioTask,
  USAGE,
  type ScenarioDependencies,
} from '../scripts/installation-scenario.ts';
import { SmokeFailure, type Answer, type OperatorApi, type SmokeClock } from '../scripts/installation-smoke.ts';

const API_URL = 'http://127.0.0.1:8080';
const WORKFLOWS = 'infra/installation/smoke/workflows.json';
const EXITED = { kind: 'exited', status: { kind: 'code', code: 0 }, startProven: true };

// Answers every post with 201 and every get with the next scripted body.
class ScriptedApi implements OperatorApi {
  readonly posts: string[] = [];
  readonly gets: string[] = [];
  readonly #bodies: unknown[];

  constructor(bodies: readonly unknown[] = []) {
    this.#bodies = [...bodies];
  }

  post(path: string): Promise<Answer> {
    this.posts.push(path);
    return Promise.resolve({ status: 201, body: {} });
  }

  get(path: string): Promise<Answer> {
    this.gets.push(path);
    return Promise.resolve({ status: 200, body: this.#bodies.shift() });
  }
}

class CollectingRecorder implements ScenarioRecorder {
  readonly runs: ScenarioRun[] = [];

  record(run: ScenarioRun): Promise<void> {
    this.runs.push(run);
    return Promise.resolve();
  }
}

const IMMEDIATE_CLOCK: SmokeClock = { now: () => 0, sleep: () => Promise.resolve() };

function dependencies(api: OperatorApi, recorder: ScenarioRecorder = new CollectingRecorder()): ScenarioDependencies {
  return { api: () => api, recorder: () => recorder, seed: () => 42, clock: IMMEDIATE_CLOCK };
}

test('each scenario task runs in its own run, named after the task', () => {
  assert.deepEqual(scenarioTask('disk-loss-task'), { runId: 'disk-loss-task-run', taskId: 'disk-loss-task' });
});

test('the commands parse with their arguments', () => {
  assert.deepEqual(parseScenarioCommand(['seed']), { name: 'seed' });
  assert.deepEqual(parseScenarioCommand(['submit', API_URL, WORKFLOWS, 't']), { name: 'submit', apiUrl: API_URL, workflows: WORKFLOWS, task: scenarioTask('t') });
  assert.deepEqual(parseScenarioCommand(['await-exit', API_URL, 't']), { name: 'await-exit', apiUrl: API_URL, task: scenarioTask('t') });
  assert.deepEqual(parseScenarioCommand(['result', API_URL, 't']), { name: 'result', apiUrl: API_URL, task: scenarioTask('t') });
  assert.deepEqual(parseScenarioCommand(['record', 'worker-kill', '7', 'passed', 'd']), { name: 'record', scenario: 'worker-kill', seed: 7, outcome: 'passed', detail: 'd' });
});

test('an unknown command or a wrong argument count is refused with the usage', () => {
  for (const argv of [[], ['unknown'], ['seed', 'extra'], ['submit', API_URL], ['record', 's', '1', 'passed']]) {
    assert.throws(() => parseScenarioCommand(argv), (error: unknown) => error instanceof SmokeFailure && error.message === USAGE, JSON.stringify(argv));
  }
});

test('the seed command prints the seed of the environment', async () => {
  assert.equal(await runScenarioCommand({ name: 'seed' }, dependencies(new ScriptedApi())), '42');
});

test('submit creates the task run and submits the task', async () => {
  const api = new ScriptedApi();
  assert.equal(await runScenarioCommand(parseScenarioCommand(['submit', API_URL, WORKFLOWS, 't']), dependencies(api)), '');
  assert.deepEqual(api.posts, ['/runs', '/runs/t-run/tasks']);
});

test('await-exit prints the ended result once it exited with code 0', async () => {
  const ended = { state: 'ended', outcome: EXITED };
  const api = new ScriptedApi([{ state: 'pending' }, ended]);
  assert.equal(await runScenarioCommand(parseScenarioCommand(['await-exit', API_URL, 't']), dependencies(api)), JSON.stringify(ended));
  assert.deepEqual(api.gets, ['/runs/t-run/tasks/t/result', '/runs/t-run/tasks/t/result']);
});

test('result prints the stored result in words', async () => {
  const api = new ScriptedApi([{ state: 'pending' }]);
  assert.equal(await runScenarioCommand(parseScenarioCommand(['result', API_URL, 't']), dependencies(api)), 'pending');
});

test('record records a compose-installation run and prints nothing', async () => {
  const recorder = new CollectingRecorder();
  const command = parseScenarioCommand(['record', 'worker-kill', '7', 'failed', 'failed while restarting']);
  assert.equal(await runScenarioCommand(command, dependencies(new ScriptedApi(), recorder)), '');
  assert.deepEqual(recorder.runs, [{ scenario: 'worker-kill', seed: 7, target: 'compose-installation', outcome: 'failed', detail: 'failed while restarting' }]);
});

test('a seed that is not digits reaches the recorder as not a number', () => {
  const command = parseScenarioCommand(['record', 's', '-1', 'passed', 'd']);
  assert.ok(command.name === 'record' && Number.isNaN(command.seed));
});

test('the result summary names the state, the outcome, the status, and the start', () => {
  const ended = (outcome: unknown): Answer => ({ status: 200, body: { state: 'ended', outcome } });
  assert.equal(resultSummary({ status: 200, body: { state: 'pending' } }), 'pending');
  assert.equal(resultSummary(ended(EXITED)), 'ended exited code 0 start-proven');
  assert.equal(resultSummary(ended({ kind: 'exited', status: { kind: 'signal', signal: 'SIGKILL' }, startProven: false })), 'ended exited signal SIGKILL start-unproven');
  assert.equal(resultSummary(ended({ kind: 'exited', status: { kind: 'unknown' }, startProven: true })), 'ended exited unknown start-proven');
  assert.equal(resultSummary(ended({ kind: 'not-started' })), 'ended not-started');
});

test('the result summary fails on a refused read or a body without a state', () => {
  assert.throws(() => resultSummary({ status: 404, body: { code: 'not-found' } }), /reading the result answered 404/);
  assert.throws(() => resultSummary({ status: 200, body: null }), /reading the result answered 200/);
});
