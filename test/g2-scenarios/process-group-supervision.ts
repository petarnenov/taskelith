import { join } from 'node:path';
import type { ExecutionId } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import {
  fileRecordListing,
  type ExecutionSupervision,
  type LaunchHost,
  type LaunchPlan,
  type RecoveryRound,
  type SupervisedFacts,
  type SupervisedRecovery,
} from '@taskelith/worker';
import {
  FileRecordStore,
  LinuxDeadlineClock,
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
  startDetachedProcess,
  startSupervisor,
  type Command,
  type LaunchRecord,
  type Platform,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';

export const SUPERVISOR_SCRIPT = join(import.meta.dirname, 'fixtures', 'process-group-supervisor.ts');

// Linux without a delegated cgroup subtree, as on a make verify host: the
// supervisor signals the child's process group and proves its end by /proc.
export function processGroupPlatform(): Platform {
  const inspector = new LinuxProcessInspector();
  return {
    name: 'linux', clock: new LinuxDeadlineClock(inspector), inspector,
    containment: () => undefined, namespaceIncarnation: () => undefined,
  };
}

// The launch host of a scenario worker: the real record and supervisor
// modules, with a detached supervisor process on the process-group platform.
export function processGroupHost(executions: string, command: Command, beforeStart: () => Promise<void> = async () => undefined): LaunchHost {
  const platform = processGroupPlatform();
  return {
    clock: platform.clock,
    supervision: (executionId) => new ProcessGroupSupervision(join(executions, executionId), executionId, { platform, command, beforeStart }),
    records: fileRecordListing(executions),
  };
}

interface SupervisionSettings {
  readonly platform: Platform;
  readonly command: Command;
  // Awaited before the supervisor starts, so a scenario can hold it.
  readonly beforeStart: () => Promise<void>;
}

// The worker's side of one execution record, as the product's file
// supervision does it, but starting the scenario's supervisor program.
class ProcessGroupSupervision implements ExecutionSupervision {
  readonly #executionId: ExecutionId;
  readonly #settings: SupervisionSettings;
  readonly #dependencies: WorkerSupervisionDependencies;

  constructor(directory: string, executionId: ExecutionId, settings: SupervisionSettings) {
    this.#executionId = executionId;
    this.#settings = settings;
    this.#dependencies = {
      store: new FileRecordStore(directory),
      lock: new SqliteExecutionLock(directory),
      platform: settings.platform,
      startSupervisor: (mode) => startSupervisorProcess(mode, directory),
      crashPoint: () => undefined,
    };
  }

  prepare(plan: LaunchPlan): Promise<Result<void>> {
    return prepareRecord(this.#dependencies, {
      executionId: this.#executionId, ...plan, supervisorVersion: '0.0.0', command: this.#settings.command,
    });
  }

  async start(): Promise<Result<void>> {
    await this.#settings.beforeStart();
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
    const launch = text.value === undefined ? undefined : parseLaunch(text.value);
    const { handle, exit, cancellationNotApplied, problems } = facts.value;
    return ok({
      problems, cancellationNotApplied,
      ...(launch?.ok ? { launch: launch.value } : {}),
      ...(handle?.kind === 'spawned' ? { process: { platform: 'linux' as const, ...handle.process, processGroupId: handle.processGroupId } } : {}),
      ...(exit === undefined ? {} : { exit }),
    });
  }

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

function startSupervisorProcess(mode: 'launch' | 'adopt', directory: string): Promise<Result<void>> {
  return startDetachedProcess({
    executable: process.execPath, arguments: ['--experimental-strip-types', '--no-warnings', SUPERVISOR_SCRIPT, mode, directory],
  });
}
