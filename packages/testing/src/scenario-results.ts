import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { arch, release, type } from 'node:os';
import { resolve } from 'node:path';
import { isSeed, rerunHint } from './seeded-random.js';

export const SCENARIO_RESULTS_VARIABLE = 'TASKELITH_SCENARIO_RESULTS';

// Real modules against make services; the item 23 Compose installation;
// node:test suites on the host; and the suites in a Linux test container.
export const SCENARIO_TARGETS = ['harness-composition', 'compose-installation', 'host-test-suite', 'linux-test-container'] as const;
export type ScenarioTarget = (typeof SCENARIO_TARGETS)[number];

export const SCENARIO_OUTCOMES = ['passed', 'failed'] as const;
export type ScenarioOutcome = (typeof SCENARIO_OUTCOMES)[number];

const SCENARIO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ACCEPTANCE_VARIABLE = 'TASKELITH_ACCEPTANCE';

// The G2 rows of the native acceptance gates (docs/worker-platforms.md).
export const ACCEPTANCE_ROWS = ['service-lifecycle', 'process-ownership', 'journal-and-storage', 'cancellation', 'connectivity'] as const;
export type AcceptanceRow = (typeof ACCEPTANCE_ROWS)[number];

export const MATRIX_ENTRIES = ['linux-ubuntu-24.04-x86_64', 'linux-ubuntu-24.04-arm64', 'macos-26-x86_64', 'macos-26-arm64'] as const;
export type MatrixEntry = (typeof MATRIX_ENTRIES)[number];

export interface AcceptancePlatform {
  readonly os: string;
  readonly architecture: string;
  readonly kernel: string;
  readonly filesystem: string;
  readonly node: string;
  readonly docker: string;
}

// The matrix entry, acceptance row, and proof that a run serves.
export interface AcceptanceContext {
  readonly entry: MatrixEntry;
  readonly row: AcceptanceRow;
  readonly proof: string;
  readonly platform: AcceptancePlatform;
}

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
  readonly acceptance?: AcceptanceContext;
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
  const environment = { host: `${type()} ${release()}`, arch: arch(), commit: headCommit(options) };
  const acceptance = (options.env ?? process.env)[ACCEPTANCE_VARIABLE];
  if (acceptance === undefined || acceptance === '') return environment;
  return { ...environment, acceptance: parseAcceptanceContext(acceptance) };
}

// Parses the JSON of TASKELITH_ACCEPTANCE; throws on any malformed field.
export function parseAcceptanceContext(text: string): AcceptanceContext {
  const context = parseObject(text, ACCEPTANCE_VARIABLE);
  const platform = context.platform;
  if (!isRecord(platform)) throw new RangeError(`${ACCEPTANCE_VARIABLE} needs a platform object`);
  return {
    entry: oneOf(context.entry, MATRIX_ENTRIES, 'entry'),
    row: oneOf(context.row, ACCEPTANCE_ROWS, 'row'),
    proof: nonEmpty(context.proof, 'proof'),
    platform: {
      os: nonEmpty(platform.os, 'platform.os'),
      architecture: nonEmpty(platform.architecture, 'platform.architecture'),
      kernel: nonEmpty(platform.kernel, 'platform.kernel'),
      filesystem: nonEmpty(platform.filesystem, 'platform.filesystem'),
      node: nonEmpty(platform.node, 'platform.node'),
      docker: nonEmpty(platform.docker, 'platform.docker'),
    },
  };
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
    ...(environment.acceptance === undefined ? {} : { acceptance: environment.acceptance }),
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

function parseObject(text: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new RangeError(`${name} must be JSON`, { cause: error });
  }
  if (!isRecord(parsed)) throw new RangeError(`${name} must be a JSON object`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new RangeError(`${ACCEPTANCE_VARIABLE} ${field} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  throw new RangeError(`${ACCEPTANCE_VARIABLE} ${field} must be a nonempty string`);
}
