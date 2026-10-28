import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ok, type Result } from '@taskelith/kernel';
import { linuxLaunchFromEnvironment, type LinuxLaunch } from '@taskelith/testing';
import {
  supervisionHost,
  type ExecutionSupervision,
  type LaunchHost,
  type LaunchPlan,
  type RecoveryRound,
  type SupervisedFacts,
  type SupervisedRecovery,
  type WorkerSettings,
} from '@taskelith/worker';
import { SUPERVISOR_MAIN, type LaunchRecord, type SupervisorMode } from '@taskelith/worker-supervisor';
import { processesNaming, type NamedProcess } from './leftover-processes.ts';

// Set by make verify-linux-g2-scenarios, whose runner requires it: the
// scenario workers then launch through the Linux cgroup supervisor.
export const SCENARIO_LAUNCH = linuxLaunchFromEnvironment();

// Set by make verify-macos-g2-scenarios: the scenario workers then launch
// through the worker's own macOS supervisor.
export const MACOS_LAUNCH_VARIABLE = 'TASKELITH_MACOS_SCENARIOS';

// Whether the macOS launch is asked for; asked for off macOS, it throws.
export function macosLaunchFromEnvironment(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): boolean {
  if (env[MACOS_LAUNCH_VARIABLE] !== '1') return false;
  if (platform !== 'darwin') throw new Error(`${MACOS_LAUNCH_VARIABLE} is set, but the macOS supervisor needs macOS, not ${platform}`);
  return true;
}

export type ScenarioLaunchHost = 'cgroup-supervisor' | 'macos-supervisor' | 'process-group';

// The worker's own supervisor under either launch, else the test-side one.
export const SCENARIO_LAUNCH_HOST: ScenarioLaunchHost = launchHostOf(SCENARIO_LAUNCH, macosLaunchFromEnvironment());

export function launchHostOf(linux: LinuxLaunch | undefined, macos: boolean): ScenarioLaunchHost {
  if (linux !== undefined) return 'cgroup-supervisor';
  return macos ? 'macos-supervisor' : 'process-group';
}

const CGROUP_ROOT = '/sys/fs/cgroup';

// A cancel kills the containment under the cgroup supervisor (spec
// worker-supervisor); the macOS and process-group ones send SIGTERM first.
export const CANCEL_SIGNAL: NodeJS.Signals = cancelSignalOf(SCENARIO_LAUNCH_HOST);

export function cancelSignalOf(host: ScenarioLaunchHost): NodeJS.Signals {
  return host === 'cgroup-supervisor' ? 'SIGKILL' : 'SIGTERM';
}

// What the guard needs of a scenario worker.
export interface SupervisedWorker {
  readonly containmentParent: string | undefined;
  readonly dataRoot: string;
}

// Under a native launch each scripted process is the worker's own: in a
// containment of its parent on Linux, a supervisor's child on macOS.
export function assertWorkerSupervised(worker: SupervisedWorker, pids: readonly number[]): void {
  if (SCENARIO_LAUNCH_HOST === 'process-group') return;
  assert.ok(pids.length > 0, 'a scripted process to check');
  if (SCENARIO_LAUNCH_HOST === 'macos-supervisor') assertMacosSupervised(worker.dataRoot, pids);
  else assertContained(worker.containmentParent, pids);
}

// A parent that is no supervisor naming DATAROOT fails it: a test-side
// parent, or a supervisor of another worker.
export function assertMacosSupervised(dataRoot: string, pids: readonly number[]): void {
  const supervisors = new Set(supervisorProcesses(dataRoot).map(({ pid }) => pid));
  for (const pid of pids) {
    const parent = parentOf(pid);
    assert.ok(supervisors.has(parent), `process ${pid} is a child of ${parent}, not of a supervisor of ${dataRoot}`);
  }
}

function parentOf(pid: number): number {
  return Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim());
}

// The worker's own supervisor processes of MODE, or of any mode, whose
// execution directories lie below DATAROOT.
export function supervisorProcesses(dataRoot: string, mode?: SupervisorMode): NamedProcess[] {
  const program = mode === undefined ? SUPERVISOR_MAIN : `${SUPERVISOR_MAIN} ${mode} `;
  return processesNaming(dataRoot).filter(({ commandLine }) => commandLine.includes(program));
}

function assertContained(workerParent: string | undefined, pids: readonly number[]): void {
  assert.ok(workerParent !== undefined, 'the worker has its own containment parent');
  for (const pid of pids) {
    const cgroup = `${CGROUP_ROOT}${cgroupOf(pid)}`;
    assert.ok(isContainmentOf(workerParent, cgroup), `process ${pid} runs in ${cgroup}, not in a containment of ${workerParent}`);
  }
}

// One more path segment below the parent: a containment, not the parent.
export function isContainmentOf(parent: string, cgroup: string): boolean {
  return dirname(cgroup) === parent && basename(cgroup) !== '';
}

// The unified hierarchy's line of /proc/PID/cgroup: `0::/path`.
function cgroupOf(pid: number): string {
  const line = readFileSync(`/proc/${pid}/cgroup`, 'utf8').split('\n').find((entry) => entry.startsWith('0::'));
  return line === undefined ? '' : line.slice('0::'.length);
}

// One scenario worker's own parent below the delegated one, so that its
// start scan never reports another worker's containment as unrecorded.
export function workerContainmentParent(launch: LinuxLaunch, base: string, name: string): string {
  return join(launch.TASKELITH_CONTAINMENT_PARENT, `${basename(base)}-${name}`);
}

// Runs one recovery of the worker's own supervisor, so that a scenario
// can hold it or watch what it decided.
export type RecoveryWrap = (recover: () => Promise<Result<SupervisedRecovery>>) => Promise<Result<SupervisedRecovery>>;

export const UNWRAPPED_RECOVERY: RecoveryWrap = (recover) => recover();

// The scenario's holds on the worker's own supervision calls.
export interface SupervisionHolds {
  readonly beforeStart: () => Promise<void>;
  readonly aroundRecover: RecoveryWrap;
}

// The worker's own launch host, as apps/worker composes it, with each
// supervisor start and recovery held as the scenario says.
export function workerLaunchHost(settings: WorkerSettings, executions: string, holds: SupervisionHolds): Result<LaunchHost> {
  const host = supervisionHost(settings, executions, SUPERVISOR_VERSION);
  if (!host.ok) return host;
  const { supervision } = host.value;
  return ok({ ...host.value, supervision: (executionId) => new HeldSupervision(supervision(executionId), holds) });
}

const SUPERVISOR_VERSION = '0.0.0';

class HeldSupervision implements ExecutionSupervision {
  readonly #supervision: ExecutionSupervision;
  readonly #holds: SupervisionHolds;

  constructor(supervision: ExecutionSupervision, holds: SupervisionHolds) {
    this.#supervision = supervision;
    this.#holds = holds;
  }

  prepare(plan: LaunchPlan): Promise<Result<void>> {
    return this.#supervision.prepare(plan);
  }

  async start(): Promise<Result<void>> {
    await this.#holds.beforeStart();
    return this.#supervision.start();
  }

  seal(): Promise<Result<LaunchRecord>> {
    return this.#supervision.seal();
  }

  cancel(reason: string): Promise<Result<void>> {
    return this.#supervision.cancel(reason);
  }

  read(): Promise<Result<SupervisedFacts>> {
    return this.#supervision.read();
  }

  recover(round: RecoveryRound): Promise<Result<SupervisedRecovery>> {
    return this.#holds.aroundRecover(() => this.#supervision.recover(round));
  }

  remove(): Promise<Result<void>> {
    return this.#supervision.remove();
  }
}
