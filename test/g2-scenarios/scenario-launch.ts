import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
import type { LaunchRecord } from '@taskelith/worker-supervisor';

// Set by make verify-linux-g2-scenarios: the scenario workers then launch
// through the product's Linux cgroup supervisor.
export const SCENARIO_LAUNCH = linuxLaunchFromEnvironment();

const CGROUP_ROOT = '/sys/fs/cgroup';

// A cancel kills the containment under the cgroup supervisor (spec
// worker-supervisor); the process-group supervisor sends SIGTERM first.
export const CANCEL_SIGNAL: NodeJS.Signals = SCENARIO_LAUNCH === undefined ? 'SIGTERM' : 'SIGKILL';

// Under the cgroup supervisor each process runs in a containment below
// the delegated parent; elsewhere there is nothing to check.
export function assertContained(pids: readonly number[]): void {
  if (SCENARIO_LAUNCH === undefined) return;
  const parent = `${SCENARIO_LAUNCH.TASKELITH_CONTAINMENT_PARENT}/`;
  assert.ok(pids.length > 0, 'a scripted process to check');
  for (const pid of pids) {
    const cgroup = `${CGROUP_ROOT}${cgroupOf(pid)}`;
    assert.ok(cgroup.startsWith(parent), `process ${pid} runs in ${cgroup}, not under ${parent}`);
  }
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

// The worker's own launch host on Linux, as apps/worker composes it, with
// each supervisor start held until the scenario lets it go.
export function cgroupHost(settings: WorkerSettings, executions: string, beforeStart: () => Promise<void>): Result<LaunchHost> {
  const host = supervisionHost(settings, executions, SUPERVISOR_VERSION);
  if (!host.ok) return host;
  const { supervision } = host.value;
  return ok({ ...host.value, supervision: (executionId) => new HeldStart(supervision(executionId), beforeStart) });
}

const SUPERVISOR_VERSION = '0.0.0';

class HeldStart implements ExecutionSupervision {
  readonly #supervision: ExecutionSupervision;
  readonly #beforeStart: () => Promise<void>;

  constructor(supervision: ExecutionSupervision, beforeStart: () => Promise<void>) {
    this.#supervision = supervision;
    this.#beforeStart = beforeStart;
  }

  prepare(plan: LaunchPlan): Promise<Result<void>> {
    return this.#supervision.prepare(plan);
  }

  async start(): Promise<Result<void>> {
    await this.#beforeStart();
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
    return this.#supervision.recover(round);
  }

  remove(): Promise<Result<void>> {
    return this.#supervision.remove();
  }
}
