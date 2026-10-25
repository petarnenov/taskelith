import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { darwinPlatform } from './darwin.js';
import { loadDarwinNative } from './darwin-native.js';
import { SqliteExecutionLock } from './execution-lock.js';
import { FileRecordStore } from './file-record-store.js';
import { linuxPlatform } from './linux.js';
import { NodeSpawner } from './node-spawner.js';
import type { Platform } from './ports.js';
import type { Command } from './record.js';
import { adoptExecution } from './adoption.js';
import { superviseLaunch } from './supervisor.js';
import type { SupervisorOutcome, SupervisorTiming } from './supervisor-session.js';
import type { SupervisorMode } from './worker-supervision.js';

export interface ProgramArguments {
  readonly mode: SupervisorMode;
  readonly directory: string;
  // The delegated cgroup that holds containments; Linux only.
  readonly containmentParent?: string;
}

// The module the worker starts as the detached supervisor process.
export const SUPERVISOR_MAIN = fileURLToPath(new URL('./supervisor-main.js', import.meta.url));

export const SUPERVISOR_TIMING: SupervisorTiming = Object.freeze({
  pollMilliseconds: 200,
  graceMilliseconds: 5_000,
  retryMilliseconds: 1_000,
  unreadablePolls: 50,
});

const CONTAINMENT_PARENT = '--containment-parent';

// CP4 passes the mode, the execution directory, and on Linux the
// containment parent that the worker's configuration names.
export function parseProgramArguments(argv: readonly string[]): Result<ProgramArguments> {
  const [mode, directory, flag, parent, ...rest] = argv;
  const valid = (mode === 'launch' || mode === 'adopt') && directory !== undefined && rest.length === 0
    && (flag === undefined || (flag === CONTAINMENT_PARENT && parent !== undefined));
  if (!valid) return err(failure('invalid', `usage: supervisor launch|adopt DIRECTORY [${CONTAINMENT_PARENT} PATH]`));
  return ok({ mode, directory, ...(parent === undefined ? {} : { containmentParent: parent }) });
}

export function supervisorCommand(program: ProgramArguments): Command {
  const parent = program.containmentParent === undefined ? [] : [CONTAINMENT_PARENT, program.containmentParent];
  return { executable: process.execPath, arguments: [SUPERVISOR_MAIN, program.mode, program.directory, ...parent] };
}

// CP4: a detached process in a new session, which outlives the worker. A
// spawn error arrives as an event, so the result waits for spawn or error.
export function startDetachedSupervisor(program: ProgramArguments): Promise<Result<void>> {
  return startDetachedProcess(supervisorCommand(program));
}

export function startDetachedProcess(command: Command): Promise<Result<void>> {
  return new Promise((resolve) => {
    const child = spawn(command.executable, [...command.arguments], { detached: true, stdio: 'ignore' });
    child.once('spawn', () => {
      child.unref();
      resolve(ok(undefined));
    });
    child.once('error', (error) => resolve(err(failure('unavailable', `cannot start the supervisor: ${error.message}`))));
  });
}

export function hostPlatform(containmentParent: string | undefined, host: NodeJS.Platform = process.platform): Result<Platform> {
  if (host === 'darwin') return ok(darwinPlatform(loadDarwinNative()));
  if (host !== 'linux') return err(failure('unavailable', `no supervisor platform for ${host}`));
  if (containmentParent === undefined) return err(failure('invalid', `Linux needs ${CONTAINMENT_PARENT}`));
  return ok(linuxPlatform({ containmentParent }));
}

export interface ProgramOptions {
  readonly crashPoint?: (point: string) => void;
  readonly timing?: SupervisorTiming;
}

export async function runSupervisorProgram(argv: readonly string[], options: ProgramOptions = {}): Promise<Result<SupervisorOutcome>> {
  const program = parseProgramArguments(argv);
  if (!program.ok) return program;
  const platform = hostPlatform(program.value.containmentParent);
  if (!platform.ok) return platform;
  const dependencies = {
    store: new FileRecordStore(program.value.directory),
    lock: new SqliteExecutionLock(program.value.directory),
    platform: platform.value,
    spawner: new NodeSpawner(),
    selfPid: process.pid,
    timing: options.timing ?? SUPERVISOR_TIMING,
    sleep: (milliseconds: number) => delay(milliseconds),
    crashPoint: options.crashPoint ?? (() => undefined),
  };
  return ok(await (program.value.mode === 'launch' ? superviseLaunch(dependencies) : adoptExecution(dependencies)));
}
