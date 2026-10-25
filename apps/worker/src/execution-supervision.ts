import { join } from 'node:path';
import type { ExecutionId } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import {
  FileRecordStore,
  parseLaunch,
  prepareRecord,
  readReportedFacts,
  recoverExecution,
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
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';
import type {
  ExecutionSupervision,
  LaunchPlan,
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
    const { handle, exit, problems } = facts.value;
    const platform = this.#options.platform.name;
    return ok({
      problems,
      ...(launch?.ok ? { launch: launch.value } : {}),
      ...(handle?.kind === 'spawned' ? { process: { platform, ...handle.process, processGroupId: handle.processGroupId } } : {}),
      ...(exit === undefined ? {} : { exit }),
    });
  }

  async recover(): Promise<Result<SupervisedRecovery>> {
    const recovered = await recoverExecution(this.#dependencies, 'record');
    if (!recovered.ok) return recovered;
    switch (recovered.value.fact) {
      case 'not-started':
        return ok({ fact: 'not-started' });
      case 'exited':
        return ok({ fact: 'exited', exit: recovered.value.exit });
      case 'adopted':
      case 'retry':
        return ok({ fact: 'observe' });
      case 'uncertain':
        return ok({ fact: 'uncertain' });
    }
  }
}
