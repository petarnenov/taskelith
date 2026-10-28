import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LINUX_CONTAINMENT_CHECK_ID, LINUX_CONTAINMENT_SCOPE, type SelfCheckRun, type WorkerAdmissionCheck } from '@taskelith/fleet';
import type { Result } from '@taskelith/kernel';
import { checkLinuxContainment, parseCgroup, type LinuxSelfCheckOptions } from '@taskelith/worker-supervisor';
import type { WorkerSettings } from './settings.js';

const CGROUP_ROOT = '/sys/fs/cgroup';

// The host's side of the check, replaced in tests.
export interface LinuxContainmentProbe {
  readonly cgroupRoot: string;
  readSelfCgroup(): string;
  check(options: LinuxSelfCheckOptions): Result<void, readonly string[]>;
}

export const LINUX_PROBE: LinuxContainmentProbe = Object.freeze({
  cgroupRoot: CGROUP_ROOT,
  readSelfCgroup: () => readFileSync('/proc/self/cgroup', 'utf8'),
  check: checkLinuxContainment,
});

// Supervisor identity section 8 for a Linux worker that launches; the
// runner never calls `run` where the scope does not apply.
export function linuxContainmentCheck(settings: WorkerSettings, probe: LinuxContainmentProbe = LINUX_PROBE): WorkerAdmissionCheck {
  return Object.freeze({
    checkId: LINUX_CONTAINMENT_CHECK_ID,
    scope: LINUX_CONTAINMENT_SCOPE,
    run: async () => runCheck(settings, probe),
  });
}

function runCheck(settings: WorkerSettings, probe: LinuxContainmentProbe): SelfCheckRun {
  const { containmentParent } = settings;
  const account = settings.launch?.executionAccount;
  if (containmentParent === undefined || account === undefined) {
    return failed(['a launching Linux worker needs a containment parent and an execution account']);
  }
  const home = parseCgroup(probe.readSelfCgroup());
  if (!home.ok) return failed([`the home cgroup cannot be read: ${home.error.message}`]);
  const checked = probe.check({ cgroupRoot: probe.cgroupRoot, containmentParent, home: join(probe.cgroupRoot, home.value), account });
  return checked.ok ? { outcome: 'passed' } : failed(checked.error);
}

function failed(problems: readonly string[]): SelfCheckRun {
  return { outcome: 'failed', problems };
}
