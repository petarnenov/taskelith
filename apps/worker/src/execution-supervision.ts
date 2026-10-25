import { join } from 'node:path';
import type { ExecutionExit, ExecutionId, ExecutionProcess } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
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
  type RecordProblem,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';

// What a launch hands its supervisor: the grant it claims and the deadline
// on the deadline clock, in the boot the reading was taken in.
export interface LaunchPlan {
  readonly attemptId: string;
  readonly ownershipGeneration: number;
  readonly launchAuthId: string;
  readonly deadline: { readonly bootId: string; readonly milliseconds: number };
}

// What the supervisor wrote, as the worker reports it (CP10 and CP12).
export interface SupervisedFacts {
  readonly launch?: LaunchRecord;
  readonly process?: ExecutionProcess;
  readonly exit?: ExecutionExit;
  readonly problems: readonly RecordProblem[];
}

// What recovery after a failed supervisor start found.
export type SupervisedRecovery =
  | { readonly fact: 'not-started' }
  | { readonly fact: 'exited'; readonly exit: ExecutionExit }
  | { readonly fact: 'observe' }
  | { readonly fact: 'uncertain' };

// One execution's record and supervisor (supervisor identity contract,
// section 4), as the launch orchestrator drives them.
export interface ExecutionSupervision {
  // CP2: refused once a supervisor started or a launch record exists.
  prepare(plan: LaunchPlan): Promise<Result<void>>;
  // CP4: a detached supervisor in launch mode.
  start(): Promise<Result<void>>;
  // Creates the directory if needed; the winning launch record comes back.
  seal(): Promise<Result<LaunchRecord>>;
  cancel(reason: string): Promise<Result<void>>;
  read(): Promise<Result<SupervisedFacts>>;
  recover(): Promise<Result<SupervisedRecovery>>;
}

export type SupervisionFactory = (executionId: ExecutionId) => ExecutionSupervision;

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

// A launch record that is a claim proves a supervisor may have spawned.
export function sealWon(launch: LaunchRecord): Result<void> {
  return launch.kind === 'seal' ? ok(undefined) : err(failure('conflict', 'a supervisor claimed the launch record'));
}
