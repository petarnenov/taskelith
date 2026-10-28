import { chmodSync, chownSync, writeFileSync } from 'node:fs';

// What a Linux worker needs to launch: the delegated cgroup and the
// execution account; the privileged Linux test runner sets them.
export const LINUX_LAUNCH_VARIABLES = ['TASKELITH_CONTAINMENT_PARENT', 'TASKELITH_EXECUTION_UID', 'TASKELITH_EXECUTION_GID'] as const;

export type LinuxLaunchVariable = (typeof LINUX_LAUNCH_VARIABLES)[number];
export type LinuxLaunch = Readonly<Record<LinuxLaunchVariable, string>>;

export interface ExecutionAccountIds {
  readonly uid: number;
  readonly gid: number;
}

// The Linux launch settings when all are set; none on any other host.
export function linuxLaunchFromEnvironment(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): LinuxLaunch | undefined {
  if (platform !== 'linux') return undefined;
  const entries = LINUX_LAUNCH_VARIABLES.map((variable) => [variable, env[variable] ?? ''] as const);
  return entries.every(([, setting]) => setting !== '') ? Object.freeze(Object.fromEntries(entries) as LinuxLaunch) : undefined;
}

export function executionAccountOf(launch: LinuxLaunch): ExecutionAccountIds {
  return { uid: Number(launch.TASKELITH_EXECUTION_UID), gid: Number(launch.TASKELITH_EXECUTION_GID) };
}

// Lets the execution account pass through BASE to files it knows by name,
// and creates each writable file empty, owned by the account.
export function admitExecutionAccount(base: string, launch: LinuxLaunch, writableFiles: readonly string[] = []): void {
  chmodSync(base, 0o711);
  const { uid, gid } = executionAccountOf(launch);
  for (const file of writableFiles) {
    writeFileSync(file, '');
    chownSync(file, uid, gid);
  }
}
