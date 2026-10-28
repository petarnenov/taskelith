import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linuxLaunchFromEnvironment } from '@taskelith/testing';

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
