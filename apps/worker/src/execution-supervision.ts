import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutionId, ExecutionProcess } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  FileRecordStore,
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
  ExecutionSupervision,
  LaunchPlan,
  RecordListing,
  RecoveryRound,
  SupervisedFacts,
  SupervisedRecovery,
  SupervisionFactory,
} from './execution-supervision-port.js';

// The program every launch runs and the platform settings it runs under.
export interface LaunchProgram {
  readonly command: Command;
  readonly executionAccount?: ExecutionAccount;
  readonly containmentParent?: string;
  readonly supervisorVersion: string;
}

export interface FileSupervisionOptions {
  readonly executions: string;
  readonly platform: Platform;
  readonly program: LaunchProgram;
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
    const { containmentParent } = options.program;
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
    const { command, executionAccount, supervisorVersion } = this.#options.program;
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
    const group = handle?.kind === 'spawned' ? handle.processGroupId : undefined;
    return ok({
      problems,
      cancellationNotApplied,
      ...(launch?.ok ? { launch: launch.value } : {}),
      ...(handle?.kind === 'spawned' ? { process: { platform, ...handle.process, processGroupId: handle.processGroupId } } : {}),
      ...(exit === undefined ? {} : { exit }),
      ...(survivors === undefined || group === undefined ? {} : { survivors: survivors.map((survivor) => survivorOf(survivor, platform, group)) }),
    });
  }

  // The worker journaled the record (W4) before any supervisor started.
  async recover(round: RecoveryRound): Promise<Result<SupervisedRecovery>> {
    const recovered = await recoverExecution(this.#dependencies, 'record', round === 'after-retry');
    if (!recovered.ok) return recovered;
    return ok(recovered.value.fact === 'adopted' ? { fact: 'observe' } : recovered.value);
  }

  async remove(): Promise<Result<void>> {
    const exists = await this.#dependencies.store.exists();
    if (!exists.ok || !exists.value) return exists.ok ? ok(undefined) : exists;
    return removeRecord(this.#dependencies);
  }
}

// An entry an earlier supervisor wrote names no group: the child's, then.
function survivorOf(survivor: SurvivingProcess, platform: 'linux' | 'darwin', childGroup: number): ExecutionProcess {
  const { bootId, pid, startTime, processGroupId } = survivor;
  return { platform, bootId, pid, startTime, processGroupId: processGroupId ?? childGroup };
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
