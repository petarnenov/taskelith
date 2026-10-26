import { scenarioRecorderFromEnvironment, seedFromEnvironment, type ScenarioRecorder } from '@taskelith/testing';
import {
  awaitExitedWithZero,
  httpOperatorApi,
  readSmokeWorkflow,
  resultPath,
  SmokeFailure,
  submitTask,
  SYSTEM_SMOKE_CLOCK,
  type Answer,
  type OperatorApi,
  type SmokeClock,
  type SmokeTask,
} from './installation-smoke.ts';

// The test-side steps of the Compose failure scenarios (installation.sh):
// submitting and awaiting tasks, the seed, and the recorded result.

export const USAGE = 'usage: installation-scenario.ts seed | submit API_URL WORKFLOWS_FILE TASK'
  + ' | await-exit API_URL TASK | result API_URL TASK | record SCENARIO SEED passed|failed DETAIL';

export type ScenarioCommand =
  | { readonly name: 'seed' }
  | { readonly name: 'submit'; readonly apiUrl: string; readonly workflows: string; readonly task: SmokeTask }
  | { readonly name: 'await-exit' | 'result'; readonly apiUrl: string; readonly task: SmokeTask }
  | { readonly name: 'record'; readonly scenario: string; readonly seed: number; readonly outcome: string; readonly detail: string };

export interface ScenarioDependencies {
  readonly api: (apiUrl: string) => OperatorApi;
  readonly recorder: () => ScenarioRecorder;
  readonly seed: () => number;
  readonly clock: SmokeClock;
}

// Each scenario task runs in its own run, named after the task.
export function scenarioTask(taskId: string): SmokeTask {
  return { runId: `${taskId}-run`, taskId };
}

export function parseScenarioCommand(argv: readonly string[]): ScenarioCommand {
  const [name, ...rest] = argv;
  if (name === 'seed' && rest.length === 0) return { name };
  if (name === 'submit' && rest.length === 3) return { name, apiUrl: rest[0]!, workflows: rest[1]!, task: scenarioTask(rest[2]!) };
  if ((name === 'await-exit' || name === 'result') && rest.length === 2) return { name, apiUrl: rest[0]!, task: scenarioTask(rest[1]!) };
  if (name === 'record' && rest.length === 4) {
    return { name, scenario: rest[0]!, seed: seedText(rest[1]!), outcome: rest[2]!, detail: rest[3]! };
  }
  throw new SmokeFailure(USAGE);
}

// Returns the text to print, if any.
export async function runScenarioCommand(command: ScenarioCommand, dependencies: ScenarioDependencies): Promise<string> {
  switch (command.name) {
    case 'seed':
      return String(dependencies.seed());
    case 'submit':
      await submitTask(dependencies.api(command.apiUrl), readSmokeWorkflow(command.workflows), command.task);
      return '';
    case 'await-exit':
      return JSON.stringify(await awaitExitedWithZero(dependencies.api(command.apiUrl), command.task, dependencies.clock));
    case 'result':
      return resultSummary(await dependencies.api(command.apiUrl).get(resultPath(command.task)));
    case 'record':
      await dependencies.recorder().record({
        scenario: command.scenario, seed: command.seed, target: 'compose-installation',
        outcome: command.outcome as 'passed' | 'failed', detail: command.detail,
      });
      return '';
  }
}

interface StoredResult {
  readonly state?: unknown;
  readonly outcome?: {
    readonly kind?: unknown;
    readonly status?: { readonly kind?: unknown; readonly code?: unknown; readonly signal?: unknown };
    readonly startProven?: unknown;
  };
}

// A stored task result in words: `pending`, or for example `ended exited
// code 0 start-proven` or `ended not-started`.
export function resultSummary({ status, body }: Answer): string {
  const { state, outcome } = (body ?? {}) as StoredResult;
  if (status !== 200 || typeof state !== 'string') throw new SmokeFailure(`reading the result answered ${status}: ${JSON.stringify(body)}`);
  if (state !== 'ended') return state;
  const words = [state, String(outcome?.kind)];
  if (outcome?.status !== undefined) words.push(String(outcome.status.kind), String(outcome.status.code ?? outcome.status.signal ?? ''));
  if (outcome?.startProven !== undefined) words.push(outcome.startProven === true ? 'start-proven' : 'start-unproven');
  return words.filter((word) => word !== '').join(' ');
}

// The recorder validates the range; only digits are accepted here.
function seedText(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

function systemDependencies(operatorToken: string): ScenarioDependencies {
  return {
    api: (apiUrl) => httpOperatorApi(apiUrl, operatorToken),
    recorder: () => scenarioRecorderFromEnvironment(),
    seed: () => seedFromEnvironment(),
    clock: SYSTEM_SMOKE_CLOCK,
  };
}

// The operator secret comes from TASKELITH_OPERATOR_TOKEN.
if (import.meta.main) {
  try {
    const command = parseScenarioCommand(process.argv.slice(2));
    const output = await runScenarioCommand(command, systemDependencies(process.env.TASKELITH_OPERATOR_TOKEN ?? ''));
    if (output !== '') process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`installation-scenario: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
