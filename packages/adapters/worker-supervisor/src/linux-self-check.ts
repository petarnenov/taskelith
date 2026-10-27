import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
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
  // Otherwise the containment scan would report the worker itself.
  if (isAtOrUnder(options.home, options.containmentParent)) {
    return err([`the home cgroup ${options.home} is at or under the containment parent ${options.containmentParent}`]);
  }
  const probe = join(options.containmentParent, `self-check-${process.pid}`);
  try {
    // A probe left by an earlier check of a reused process ID is replaced.
    if (existsSync(probe)) rmdirSync(probe);
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

// Compares whole path segments, so that /a/bc is not under /a/b.
function isAtOrUnder(cgroup: string, ancestor: string): boolean {
  const cgroupSegments = segments(cgroup);
  return segments(ancestor).every((segment, index) => cgroupSegments[index] === segment);
}

function segments(path: string): readonly string[] {
  return resolve(path).split(sep).filter((segment) => segment !== '');
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
