import { closeSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localReader, parseHostsConfig, readSshHost, sshRunner, type HostConfig, type HostReport, type SshRunner,
} from './task-progress-hosts.ts';
import { applyQueue, deriveTasks, LANDED, parseQueue, STAGES, type TaskProgress } from './task-progress-stages.ts';

// make progress and make progress-refresh: the stage of every worker task,
// from brief to landed, on this host and the SSH hosts of the hosts file.

export interface ProgressPaths {
  readonly hosts: string;
  readonly queue: string;
  readonly cache: string;
  readonly lock: string;
}

export function progressPaths(configDirectory: string): ProgressPaths {
  return {
    hosts: join(configDirectory, 'progress-hosts.json'),
    queue: join(configDirectory, 'integration-queue.json'),
    cache: join(configDirectory, 'progress.json'),
    lock: join(configDirectory, 'progress.lock'),
  };
}

export const LOCAL_HOST = 'local';
// A refresh that holds the lock longer has died.
export const LOCK_TIMEOUT_SECONDS = 300;

export interface ProgressReport {
  readonly generatedAt: string;
  readonly generatedAtEpoch: number;
  readonly problems: readonly string[];
  readonly hosts: readonly HostReport[];
}

export interface CollectOptions {
  readonly repo: string;
  readonly paths: ProgressPaths;
  readonly ssh: SshRunner;
  readonly now: Date;
}

export function collectProgress({ repo, paths, ssh, now }: CollectOptions): ProgressReport {
  const seconds = Math.floor(now.getTime() / 1000);
  const config = parseHostsConfig(localReader.read(paths.hosts));
  const queued = parseQueue(localReader.read(paths.queue));
  const local: HostReport = { name: LOCAL_HOST, status: 'ok', tasks: deriveTasks(localReader, repo, seconds) };
  const remote = config.hosts.map((host: HostConfig) => readSshHost(ssh, host, seconds));
  return {
    generatedAt: now.toISOString(),
    generatedAtEpoch: seconds,
    problems: config.problem === undefined ? [] : [config.problem],
    hosts: [local, ...remote].map((host) => ({ ...host, tasks: applyQueue(host.tasks, queued) })),
  };
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d${hours % 24}h`;
  return hours > 0 ? `${hours}h${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

export function progressBar(stage: number): string {
  return '█'.repeat(stage) + '░'.repeat(STAGES.length - stage);
}

function clock(epoch: number): string {
  const date = new Date(epoch * 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function elapsedSeconds(task: TaskProgress, now: number): number | undefined {
  if (task.startedAt === undefined) return undefined;
  return (task.landedAt ?? now) - task.startedAt;
}

function stageLabel(task: TaskProgress): string {
  const stopped = task.review.stopped && task.stage < STAGES.indexOf('archived') + 1 ? ', review done at a Low-only pass' : '';
  return `${task.stage}/${STAGES.length} ${task.stageName}${stopped}`;
}

function taskLines(host: string, task: TaskProgress, now: number): string[] {
  const elapsed = elapsedSeconds(task, now);
  const times = task.reached.map((stage) => `${stage.name} ${stage.at === undefined ? '-' : clock(stage.at)}`);
  return [
    `${host}  ${task.change}  ${progressBar(task.stage)}  ${stageLabel(task)}  ${elapsed === undefined ? '' : formatDuration(elapsed)}`.trimEnd(),
    `  ${times.join('  ')}`,
  ];
}

export function renderReport(report: ProgressReport): string {
  const now = report.generatedAtEpoch;
  const lines = [`Task progress at ${report.generatedAt} (stages: ${STAGES.map((name, index) => `${index + 1} ${name}`).join(', ')})`];
  for (const problem of report.problems) lines.push(`hosts file: ${problem}`);
  for (const host of report.hosts) {
    if (host.status !== 'ok') {
      lines.push(`${host.name}  ${host.status}${host.detail === undefined ? '' : ` (${host.detail})`}`);
      continue;
    }
    if (host.tasks.length === 0) lines.push(`${host.name}  no open task`);
    for (const task of host.tasks) lines.push(...taskLines(host.name, task, now));
  }
  return `${lines.join('\n')}\n`;
}

export function activeTasks(report: ProgressReport): number {
  return report.hosts.flatMap((host) => host.tasks).filter((task) => task.stage < LANDED).length;
}

// Readers never see a half-written cache: write a temporary file, rename.
export function writeCache(path: string, report: ProgressReport): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporary, path);
}

export function cacheAgeSeconds(path: string, now: Date): number | undefined {
  const report = localReader.read(path);
  if (report === undefined) return undefined;
  try {
    const generated = (JSON.parse(report) as Partial<ProgressReport>).generatedAtEpoch;
    return typeof generated === 'number' ? Math.floor(now.getTime() / 1000) - generated : undefined;
  } catch {
    return undefined;
  }
}

// Returns false while another live refresh holds the lock.
export function acquireLock(path: string, now: Date): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (createExclusively(path)) return true;
  const held = statSync(path, { throwIfNoEntry: false });
  if (held !== undefined && now.getTime() - held.mtimeMs <= LOCK_TIMEOUT_SECONDS * 1000) return false;
  rmSync(path, { force: true });
  return createExclusively(path);
}

function createExclusively(path: string): boolean {
  try {
    closeSync(openSync(path, 'wx'));
    return true;
  } catch {
    return false;
  }
}

export const USAGE = 'usage: task-progress.ts [show | refresh [--if-older-than <seconds>] | local-json]';

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
}

function parseMaxAge(args: readonly string[]): number | undefined | null {
  if (args.length === 0) return undefined;
  const value = Number(args[1]);
  return args.length === 2 && args[0] === '--if-older-than' && Number.isInteger(value) && value >= 0 ? value : null;
}

function refresh(options: CollectOptions, maxAge: number | undefined): CommandResult {
  const age = cacheAgeSeconds(options.paths.cache, options.now);
  if (maxAge !== undefined && age !== undefined && age <= maxAge) return { status: 0, stdout: `progress cache is ${age} s old\n` };
  if (!acquireLock(options.paths.lock, options.now)) return { status: 0, stdout: 'another progress refresh is running\n' };
  try {
    const report = collectProgress(options);
    writeCache(options.paths.cache, report);
    return { status: 0, stdout: `wrote ${options.paths.cache}: ${activeTasks(report)} active task(s)\n` };
  } finally {
    rmSync(options.paths.lock, { force: true });
  }
}

export function runCommand(args: readonly string[], options: CollectOptions): CommandResult {
  const [command = 'show', ...rest] = args;
  if (command === 'show' && rest.length === 0) return { status: 0, stdout: renderReport(collectProgress(options)) };
  if (command === 'local-json' && rest.length === 0) {
    const tasks = deriveTasks(localReader, options.repo, Math.floor(options.now.getTime() / 1000));
    return { status: 0, stdout: `${JSON.stringify(tasks)}\n` };
  }
  const maxAge = parseMaxAge(rest);
  if (command === 'refresh' && maxAge !== null) return refresh(options, maxAge);
  return { status: 2, stdout: `${USAGE}\n` };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configDirectory = join(homedir(), '.config', 'taskelith');
  const result = runCommand(process.argv.slice(2), {
    repo: process.cwd(), paths: progressPaths(configDirectory), ssh: sshRunner(configDirectory), now: new Date(),
  });
  process.stdout.write(result.stdout);
  process.exitCode = result.status;
}
