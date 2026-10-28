import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutionId, ExecutionProcess } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  FileRecordStore,
  hostPlatform,
  LinuxContainmentScan,
  LinuxProcessInspector,
  parseLaunch,
  prepareRecord,
  readReportedFacts,
  recoverExecution,
  removeRecord,
  requestCancellation,
  RECORD_FILES,
  sealLaunch,
  SqliteExecutionLock,
  startDetachedSupervisor,
  startSupervisor,
  type Command,
  type ExecutionAccount,
  type LaunchRecord,
  type Platform,
  type SurvivingProcess,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';
import type {
  ContainmentScan,
  ExecutionSupervision,
  LaunchPlan,
  RecordListing,
  RecoveryRound,
  SupervisedFacts,
  SupervisedRecovery,
  SupervisionFactory,
} from './execution-supervision-port.js';
import type { WorkerSettings } from './settings.js';
import type { LaunchHost } from './worker-start.js';

// The program every launch runs and the account it runs as.
export interface LaunchProgram {
  readonly command: Command;
  readonly executionAccount?: ExecutionAccount;
  readonly supervisorVersion: string;
}

// Without a program the records are recovered and removed, never prepared.
export interface FileSupervisionOptions {
  readonly executions: string;
  readonly platform: Platform;
  readonly containmentParent?: string;
  readonly program?: LaunchProgram;
}

// Each execution's record in `worker/executions/<executionId>/`.
export function fileSupervision(options: FileSupervisionOptions): SupervisionFactory {
  return (executionId) => new FileExecutionSupervision(executionId, options);
}

class FileExecutionSupervision implements ExecutionSupervision {
  readonly #executionId: ExecutionId;
  readonly #options: FileSupervisionOptions;
  readonly #dependencies: WorkerSupervisionDependencies;

  constructor(executionId: ExecutionId, options: FileSupervisionOptions) {
    this.#executionId = executionId;
    this.#options = options;
    const directory = join(options.executions, executionId);
    const { containmentParent } = options;
    this.#dependencies = {
      store: new FileRecordStore(directory),
      lock: new SqliteExecutionLock(directory),
      platform: options.platform,
      startSupervisor: (mode) => startDetachedSupervisor({
        mode, directory, ...(containmentParent === undefined ? {} : { containmentParent }),
      }),
      crashPoint: () => undefined,
    };
  }

  async prepare(plan: LaunchPlan): Promise<Result<void>> {
    const { program } = this.#options;
    if (program === undefined) return err(failure('precondition-failed', 'no launch command is configured'));
    const { command, executionAccount, supervisorVersion } = program;
    const incarnation = this.#options.platform.namespaceIncarnation();
    if (incarnation !== undefined && !incarnation.ok) return incarnation;
    return prepareRecord(this.#dependencies, {
      executionId: this.#executionId, ...plan, supervisorVersion, command,
      ...(incarnation === undefined ? {} : { namespaceIncarnation: incarnation.value }),
      ...(executionAccount === undefined ? {} : { executionAccount }),
    });
  }

  start(): Promise<Result<void>> {
    return startSupervisor(this.#dependencies);
  }

  async seal(): Promise<Result<LaunchRecord>> {
    const directory = await this.#dependencies.store.createDirectory();
    return directory.ok ? sealLaunch(this.#dependencies) : directory;
  }

  cancel(reason: string): Promise<Result<void>> {
    return requestCancellation(this.#dependencies, reason);
  }

  async read(): Promise<Result<SupervisedFacts>> {
    const facts = await readReportedFacts(this.#dependencies);
    if (!facts.ok) return facts;
    const text = await this.#dependencies.store.read(RECORD_FILES.launch);
    if (!text.ok) return text;
    // An unreadable launch record is already among the facts' problems.
    const launch = text.value === undefined ? undefined : parseLaunch(text.value);
    const { handle, exit, survivors, cancellationNotApplied, problems } = facts.value;
    const platform = this.#options.platform.name;
    return ok({
      problems,
      cancellationNotApplied,
      ...(launch?.ok ? { launch: launch.value } : {}),
      ...(handle?.kind === 'spawned' ? { process: { platform, ...handle.process, processGroupId: handle.processGroupId } } : {}),
      ...(exit === undefined ? {} : { exit }),
      ...(survivors === undefined ? {} : { survivors: reportableSurvivors(survivors, platform) }),
    });
  }

  // The worker journaled the record (W4) before any supervisor started.
  async recover(round: RecoveryRound): Promise<Result<SupervisedRecovery>> {
    const recovered = await recoverExecution(this.#dependencies, 'record', round === 'after-retry');
    if (!recovered.ok) return recovered;
    const { value } = recovered;
    if (value.fact !== 'adopted') return ok(value);
    return ok(value.supervisor === 'live' ? { fact: 'observe' } : { fact: 'adopted' });
  }

  async remove(): Promise<Result<void>> {
    const exists = await this.#dependencies.store.exists();
    if (!exists.ok || !exists.value) return exists.ok ? ok(undefined) : exists;
    return removeRecord(this.#dependencies);
  }
}

// A group-less entry of an older supervisor is left out, never guessed;
// the termination stays unproven even when no entry is left.
function reportableSurvivors(survivors: readonly SurvivingProcess[], platform: 'linux' | 'darwin'): ExecutionProcess[] {
  return survivors.flatMap(({ bootId, pid, startTime, processGroupId }) => processGroupId === undefined
    ? []
    : [{ platform, bootId, pid, startTime, processGroupId }]);
}

// Directories only; anything else in `executions/` is no record.
export function fileRecordListing(executions: string): RecordListing {
  return async () => {
    try {
      const entries = await readdir(executions, { withFileTypes: true });
      return ok(Object.freeze(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok(Object.freeze([]));
      return err(failure('unavailable', `cannot list ${executions}: ${(error as Error).message}`));
    }
  };
}

// No containment exists on macOS, so surviving processes cannot be found
// there (worker journal contract, section 11).
export function containmentScan(platform: Platform, containmentParent: string | undefined): ContainmentScan | undefined {
  if (platform.name !== 'linux' || containmentParent === undefined) return undefined;
  const scan = new LinuxContainmentScan(containmentParent, new LinuxProcessInspector());
  return () => {
    const found = scan.populated();
    if (!found.ok) return found;
    return ok(Object.freeze(found.value.map(({ name, path, processes }) => ({
      name, containment: path,
      processes: processes.map(({ identity, processGroupId }) => ({ platform: 'linux' as const, ...identity, processGroupId })),
    }))));
  };
}

// The platform alone recovers and removes records; a launch command adds
// the program each launch runs.
export function supervisionHost(settings: WorkerSettings, executions: string, version: string): Result<LaunchHost> {
  const { containmentParent, launch } = settings;
  const platform = hostPlatform(containmentParent);
  if (!platform.ok) return platform;
  const program = launch === undefined ? undefined : {
    command: launch.command, supervisorVersion: version,
    ...(launch.executionAccount === undefined ? {} : { executionAccount: launch.executionAccount }),
  };
  const containments = containmentScan(platform.value, containmentParent);
  return ok({
    clock: platform.value.clock,
    supervision: fileSupervision({
      executions, platform: platform.value,
      ...(containmentParent === undefined ? {} : { containmentParent }), ...(program === undefined ? {} : { program }),
    }),
    records: fileRecordListing(executions),
    ...(containments === undefined ? {} : { containments }),
  });
}
