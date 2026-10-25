import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '@taskelith/kernel';
import type { ExecutionAccount } from './record.js';

export interface LinuxSelfCheckOptions {
  readonly cgroupRoot: string;
  readonly containmentParent: string;
  // The worker's own cgroup, which the process set must not join either.
  readonly home: string;
  readonly account: ExecutionAccount;
}

// Exits 0 if the write succeeded, 13 if it was denied, 1 otherwise.
const PROBE = `
const { writeFileSync } = require('node:fs');
try { writeFileSync(process.argv[1], String(process.pid)); process.exit(0); }
catch (error) { process.exit(error.code === 'EACCES' || error.code === 'EPERM' ? 13 : 1); }
`;

// A Linux worker is admitted only if a child can neither leave its
// containment nor join another cgroup, and containments can be killed.
export function checkLinuxContainment(options: LinuxSelfCheckOptions): Result<void, readonly string[]> {
  if (!existsSync(join(options.cgroupRoot, 'cgroup.controllers'))) return err(['cgroup v2 is not mounted']);
  const probe = join(options.containmentParent, `self-check-${process.pid}`);
  try {
    mkdirSync(probe);
  } catch (error) {
    return err([`the containment parent is not delegated: ${(error as Error).message}`]);
  }
  const problems = [
    ...(existsSync(join(probe, 'cgroup.kill')) ? [] : ['a containment has no cgroup.kill']),
    ...[probe, options.containmentParent, options.home].flatMap((cgroup) => deniedProblem(cgroup, options.account)),
    ...removalProblem(probe),
  ];
  return problems.length === 0 ? ok(undefined) : err(problems);
}

function removalProblem(probe: string): string[] {
  try {
    rmdirSync(probe);
    return [];
  } catch (error) {
    return [`the probe cgroup cannot be removed: ${(error as Error).message}`];
  }
}

function deniedProblem(cgroup: string, account: ExecutionAccount): string[] {
  const target = join(cgroup, 'cgroup.procs');
  const probe = spawnSync(process.execPath, ['-e', PROBE, target], { uid: account.uid, gid: account.gid, stdio: 'ignore' });
  if (probe.status === 13) return [];
  return [probe.status === 0 ? `the execution account can write ${target}` : `the probe of ${target} failed`];
}
