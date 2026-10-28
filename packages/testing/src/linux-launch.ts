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

// Set by the privileged Linux runner: a run without the Linux launch then
// fails instead of falling back to the process-group launch host.
export const REQUIRE_LINUX_LAUNCH_VARIABLE = 'TASKELITH_REQUIRE_LINUX_LAUNCH';

// The Linux launch settings when all are set on Linux, none when none are
// set; a partial launch, or none where the runner requires one, throws.
export function linuxLaunchFromEnvironment(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): LinuxLaunch | undefined {
  const missing = LINUX_LAUNCH_VARIABLES.filter((variable) => (env[variable] ?? '') === '');
  if (platform === 'linux' && missing.length === 0) {
    return Object.freeze(Object.fromEntries(LINUX_LAUNCH_VARIABLES.map((variable) => [variable, env[variable]!])) as LinuxLaunch);
  }
  if (env[REQUIRE_LINUX_LAUNCH_VARIABLE] === '1') {
    throw new Error(`${REQUIRE_LINUX_LAUNCH_VARIABLE} is set, but the Linux launch is not on ${platform}: missing ${missing.join(', ') || 'none'}`);
  }
  if (platform === 'linux' && missing.length < LINUX_LAUNCH_VARIABLES.length) {
    throw new Error(`a partial Linux launch: ${missing.join(', ')} not set`);
  }
  return undefined;
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
