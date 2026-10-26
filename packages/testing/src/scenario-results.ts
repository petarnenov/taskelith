import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { arch, release, type } from 'node:os';
import { resolve } from 'node:path';
import { isSeed, rerunHint } from './seeded-random.js';

export const SCENARIO_RESULTS_VARIABLE = 'TASKELITH_SCENARIO_RESULTS';

// harness-composition: real modules composed by a test against make services;
// compose-installation: the item 23 Docker Compose installation.
export const SCENARIO_TARGETS = ['harness-composition', 'compose-installation'] as const;
export type ScenarioTarget = (typeof SCENARIO_TARGETS)[number];

export const SCENARIO_OUTCOMES = ['passed', 'failed'] as const;
export type ScenarioOutcome = (typeof SCENARIO_OUTCOMES)[number];

const SCENARIO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ScenarioRun {
  readonly scenario: string;
  readonly seed: number;
  readonly target: ScenarioTarget;
  readonly outcome: ScenarioOutcome;
  readonly detail?: string;
}

export interface RunEnvironment {
  readonly host: string;
  readonly arch: string;
  readonly commit: string;
}

export interface ScenarioResult extends ScenarioRun, RunEnvironment {
  readonly rerunHint: string;
  readonly recordedAt: string;
}

export interface ScenarioRecorder {
  record(run: ScenarioRun): Promise<void>;
}

export interface RunEnvironmentOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

// Appends one JSON line per result; each append is a single write, so test
// processes that record into one file do not interleave lines.
export class FileScenarioRecorder implements ScenarioRecorder {
  constructor(
    readonly file: string,
    readonly environment: RunEnvironment,
    readonly now: () => Date = () => new Date(),
  ) {}

  async record(run: ScenarioRun): Promise<void> {
    const result = scenarioResult(run, this.environment, this.now());
    await appendFile(this.file, `${JSON.stringify(result)}\n`);
  }
}

export const discardingScenarioRecorder: ScenarioRecorder = {
  record: async (run) => {
    assertScenarioRun(run);
  },
};

// Records only when the environment names a results file, so that ordinary
// test runs leave the tree unchanged.
export function scenarioRecorderFromEnvironment(options: RunEnvironmentOptions = {}): ScenarioRecorder {
  const file = (options.env ?? process.env)[SCENARIO_RESULTS_VARIABLE];
  if (file === undefined || file === '') return discardingScenarioRecorder;
  return new FileScenarioRecorder(resolve(options.cwd ?? process.cwd(), file), runEnvironment(options));
}

export function runEnvironment(options: RunEnvironmentOptions = {}): RunEnvironment {
  return { host: `${type()} ${release()}`, arch: arch(), commit: headCommit(options) };
}

export function scenarioResult(run: ScenarioRun, environment: RunEnvironment, recordedAt: Date): ScenarioResult {
  assertScenarioRun(run);
  return {
    scenario: run.scenario,
    seed: run.seed,
    rerunHint: rerunHint(run.seed),
    host: environment.host,
    arch: environment.arch,
    commit: environment.commit,
    target: run.target,
    outcome: run.outcome,
    ...(run.detail === undefined ? {} : { detail: run.detail }),
    recordedAt: recordedAt.toISOString(),
  };
}

function headCommit({ cwd, env }: RunEnvironmentOptions): string {
  try {
    const output = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return output.trim();
  } catch (error) {
    throw new Error('A scenario result needs the commit, but git rev-parse HEAD failed', { cause: error });
  }
}

function assertScenarioRun({ scenario, seed, target, outcome }: ScenarioRun): void {
  if (!SCENARIO_NAME.test(scenario)) {
    throw new RangeError(`Scenario "${scenario}" must be lowercase words joined by hyphens`);
  }
  if (!isSeed(seed)) throw new RangeError(`Scenario seed must be an integer from 0 to 2^32 - 1, got ${seed}`);
  if (!SCENARIO_TARGETS.includes(target)) throw new RangeError(`Scenario target must be one of ${SCENARIO_TARGETS.join(', ')}, got "${target}"`);
  if (!SCENARIO_OUTCOMES.includes(outcome)) throw new RangeError(`Scenario outcome must be one of ${SCENARIO_OUTCOMES.join(', ')}, got "${outcome}"`);
}
