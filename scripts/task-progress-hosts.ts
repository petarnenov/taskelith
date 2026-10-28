import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deriveTasks, isTaskProgress, TransportError, type Reader, type TaskProgress } from './task-progress-stages.ts';

// Readers of local and SSH hosts; an SSH host runs this script when its
// clone has it, and plain git and shell commands otherwise.

export interface HostConfig {
  readonly name: string;
  readonly ssh: string;
  readonly repo: string;
}

export type HostStatus = 'ok' | 'unreachable' | 'error';

export interface HostReport {
  readonly name: string;
  readonly status: HostStatus;
  readonly detail?: string;
  readonly tasks: readonly TaskProgress[];
}

export interface CommandOutput {
  readonly status: number;
  readonly stdout: string;
}

// Runs a remote shell command; ssh exits with 255 when it cannot connect.
export type SshRunner = (target: string, command: string) => CommandOutput;

export const SSH_UNREACHABLE = 255;
export const SCRIPT_MISSING = 64;
export const REPO_MISSING = 65;
const SSH_TIMEOUT_MS = 60_000;

function withoutGitVariables(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
}

export const localReader: Reader = {
  git(cwd, args) {
    try {
      return execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8', env: withoutGitVariables(), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return undefined;
    }
  },
  read(path) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  },
  list(directory) {
    try {
      return readdirSync(directory).sort();
    } catch {
      return [];
    }
  },
  mtime(path) {
    try {
      return Math.floor(statSync(path).mtimeMs / 1000);
    } catch {
      return undefined;
    }
  },
  matchingLines(directory, needle) {
    return localReader.list(directory).flatMap((name) => {
      const text = localReader.read(join(directory, name)) ?? '';
      return text.split('\n').filter((line) => line.includes(needle));
    });
  },
};

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// A leading ~/ expands on the remote side; the rest stays quoted.
export function remotePath(path: string): string {
  return path.startsWith('~/') ? `"$HOME"/${shellQuote(path.slice(2))}` : shellQuote(path);
}

export function sshReader(run: SshRunner, target: string): Reader {
  const remote = (command: string): string | undefined => {
    const result = run(target, command);
    if (result.status === SSH_UNREACHABLE) throw new TransportError(`${target} stopped answering`);
    return result.status === 0 ? result.stdout : undefined;
  };
  return {
    git: (cwd, args) => remote(`git -C ${remotePath(cwd)} ${args.map(shellQuote).join(' ')}`),
    read: (path) => remote(`cat ${remotePath(path)}`),
    list: (directory) => (remote(`ls -1A ${remotePath(directory)}`) ?? '').split('\n').filter((name) => name !== '').sort(),
    mtime(path) {
      const quoted = remotePath(path);
      const value = Number(remote(`stat -c %Y ${quoted} 2>/dev/null || stat -f %m ${quoted}`));
      return Number.isFinite(value) && value > 0 ? value : undefined;
    },
    matchingLines(directory, needle) {
      const output = remote(`cd ${remotePath(directory)} 2>/dev/null && grep -h -F -e ${shellQuote(needle)} -- * 2>/dev/null; true`);
      return (output ?? '').split('\n').filter((line) => line.includes(needle));
    },
  };
}

// The pinned Node.js of the remote clone runs this script there.
export function remoteScriptCommand(repo: string): string {
  return [
    `cd ${remotePath(repo)} 2>/dev/null || exit ${REPO_MISSING}`,
    `[ -f scripts/task-progress.ts ] || exit ${SCRIPT_MISSING}`,
    'NODE_PIN="$(cat .nvmrc)" bash scripts/with-pinned-node.sh use node --experimental-strip-types scripts/task-progress.ts local-json',
  ].join('; ');
}

function parseTasks(stdout: string): TaskProgress[] | undefined {
  try {
    const tasks = JSON.parse(stdout) as unknown;
    return Array.isArray(tasks) && tasks.every(isTaskProgress) ? tasks : undefined;
  } catch {
    return undefined;
  }
}

function remoteRepoRoot(run: SshRunner, host: HostConfig): string | undefined {
  const result = run(host.ssh, `cd ${remotePath(host.repo)} && pwd`);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function readSshHost(run: SshRunner, host: HostConfig, now: number): HostReport {
  const scripted = run(host.ssh, remoteScriptCommand(host.repo));
  const report = (status: HostStatus, tasks: readonly TaskProgress[], detail?: string): HostReport =>
    ({ name: host.name, status, tasks, ...(detail === undefined ? {} : { detail }) });
  if (scripted.status === SSH_UNREACHABLE) return report('unreachable', []);
  if (scripted.status === REPO_MISSING) return report('error', [], `no clone at ${host.repo}`);
  if (scripted.status === 0) {
    const tasks = parseTasks(scripted.stdout);
    return tasks === undefined ? report('error', [], 'unreadable output of the remote script') : report('ok', tasks);
  }
  if (scripted.status !== SCRIPT_MISSING) return report('error', [], `remote script exited with ${scripted.status}`);
  const root = remoteRepoRoot(run, host);
  if (root === undefined) return report('unreachable', []);
  try {
    return report('ok', deriveTasks(sshReader(run, host.ssh), root, now));
  } catch (error) {
    if (error instanceof TransportError) return report('unreachable', []);
    throw error;
  }
}

// Connections are shared for 30 s, so the per-command fallback stays fast.
export function sshRunner(controlDirectory: string): SshRunner {
  return (target, command) => {
    const result = spawnSync('ssh', [
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
      '-o', 'ControlMaster=auto', '-o', `ControlPath=${join(controlDirectory, 'ssh-%C')}`, '-o', 'ControlPersist=30',
      target, command,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: SSH_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    return { status: result.status ?? SSH_UNREACHABLE, stdout: result.stdout ?? '' };
  };
}

export interface HostsConfig {
  readonly hosts: readonly HostConfig[];
  readonly problem?: string;
}

function isHost(value: unknown): value is HostConfig {
  const host = value as Partial<Record<keyof HostConfig, unknown>> | null;
  return typeof host?.name === 'string' && typeof host.ssh === 'string' && typeof host.repo === 'string';
}

// A missing file means no remote host; an invalid one is reported.
export function parseHostsConfig(text: string | undefined): HostsConfig {
  if (text === undefined) return { hosts: [] };
  try {
    const value = JSON.parse(text) as unknown;
    if (Array.isArray(value) && value.every(isHost)) return { hosts: value };
  } catch {
    // Reported below.
  }
  return { hosts: [], problem: 'the hosts file is not a JSON list of {name, ssh, repo}' };
}
