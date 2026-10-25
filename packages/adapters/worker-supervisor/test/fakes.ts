import { err, failure, ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { SimulatedHost } from '@taskelith/testing';
import {
  type ChildExit,
  type Command,
  type Containment,
  type CreateOutcome,
  type ExecutionAccount,
  type ExecutionLock,
  type HeldLock,
  type IntentRecord,
  type Platform,
  type ProcessEntry,
  type ProcessIdentity,
  type RecordStore,
  type Spawner,
  type SpawnResult,
  type SupervisorDependencies,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';

export const BOOT = 'boot-1';

const START: Instant = (() => {
  const parsed = parseInstant('2026-10-25T10:00:00.000Z');
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
})();

export function identity(pid: number, startTime = pid * 10, bootId = BOOT): ProcessIdentity {
  return { bootId, pid, startTime };
}

export function intent(overrides: Partial<IntentRecord> = {}): IntentRecord {
  return {
    executionId: 'execution-1',
    attemptId: 'attempt-1',
    ownershipGeneration: 2,
    launchAuthId: 'launch-1',
    deadline: { bootId: BOOT, milliseconds: 25_000 },
    supervisorVersion: '0.0.0',
    command: { executable: 'scripted-process', arguments: ['--exit', '0'] },
    ...overrides,
  };
}

// One execution directory in memory, with the create-once and append rules.
export class MemoryRecordStore implements RecordStore {
  readonly files = new Map<string, string>();
  directory = false;
  failing = new Set<string>();

  async createDirectory(): Promise<Result<void>> {
    this.directory = true;
    return ok(undefined);
  }

  async exists(): Promise<Result<boolean>> {
    return ok(this.directory);
  }

  async read(name: string): Promise<Result<string | undefined>> {
    return this.#guard(name, () => this.files.get(name));
  }

  async list(): Promise<Result<readonly string[]>> {
    return ok([...this.files.keys()]);
  }

  async createOnce(name: string, text: string): Promise<Result<CreateOutcome>> {
    return this.#guard(name, () => {
      if (this.files.has(name)) return 'exists' as const;
      this.files.set(name, text);
      return 'created' as const;
    });
  }

  async replace(name: string, text: string): Promise<Result<void>> {
    return this.#guard(name, () => void this.files.set(name, text));
  }

  async append(name: string, text: string): Promise<Result<void>> {
    return this.#guard(name, () => void this.files.set(name, (this.files.get(name) ?? '') + text));
  }

  async remove(name: string): Promise<Result<void>> {
    return this.#guard(name, () => void this.files.delete(name));
  }

  async removeDirectory(): Promise<Result<void>> {
    if (this.files.size > 0) return err(failure('conflict', 'the directory is not empty'));
    this.directory = false;
    return ok(undefined);
  }

  #guard<T>(name: string, action: () => T): Result<T> {
    if (!this.directory) return err(failure('not-found', 'no execution directory'));
    if (this.failing.has(name)) return err(failure('unavailable', `${name} cannot be written`));
    return ok(action());
  }
}

export class MemoryLock implements ExecutionLock {
  held = false;

  tryAcquire(): Result<HeldLock | undefined> {
    if (this.held) return ok(undefined);
    this.held = true;
    return ok({ release: () => void (this.held = false) });
  }
}

// Processes, boot, deadline clock, and containment that a test controls.
export class FakeHost {
  readonly host = new SimulatedHost(START);
  bootId = BOOT;
  processes: ProcessEntry[] = [];
  clockReadable = true;
  listingAvailable = true;
  containmentPopulated: boolean | undefined = undefined;
  readonly containmentLog: string[] = [];
  namespace = 'pid:[1]';

  readonly name: 'linux' | 'darwin';

  constructor(name: 'linux' | 'darwin' = 'darwin') {
    this.name = name;
  }

  run(entry: ProcessEntry): void {
    this.processes = [...this.processes.filter((known) => known.identity.pid !== entry.identity.pid), entry];
  }

  end(pid: number): void {
    this.processes = this.processes.filter((entry) => entry.identity.pid !== pid);
  }

  platform(): Platform {
    const containment = (executionId: string): Containment => ({
      path: `/sys/fs/cgroup/executions/${executionId}`,
      create: () => this.#logged('create'),
      admit: (pid) => this.#logged(`admit ${pid}`),
      release: (pid) => this.#logged(`release ${pid}`),
      populated: () => (this.containmentPopulated === undefined ? err(failure('unavailable', 'unreadable')) : ok(this.containmentPopulated)),
      kill: () => {
        this.containmentPopulated = false;
        return this.#logged('kill');
      },
      remove: () => this.#logged('remove'),
    });
    return {
      name: this.name,
      clock: {
        read: () => (this.clockReadable ? ok({ bootId: this.bootId, milliseconds: this.host.deadlineClock.readMilliseconds() }) : err(failure('unavailable', 'no clock'))),
      },
      inspector: {
        bootId: () => ok(this.bootId),
        identity: (pid) => ok(this.processes.find((entry) => entry.identity.pid === pid)?.identity),
        listing: () => (this.listingAvailable ? ok([...this.processes]) : err(failure('unavailable', 'no listing'))),
      },
      containment: (executionId) => (this.name === 'linux' ? ok(containment(executionId)) : undefined),
      namespaceIncarnation: () => (this.name === 'linux' ? ok(this.namespace) : undefined),
    };
  }

  #logged(step: string): Result<void> {
    this.containmentLog.push(step);
    return ok(undefined);
  }
}

// Spawns nothing real: the child is a fake process the test ends.
export class FakeSpawner implements Spawner {
  readonly spawned: { command: Command; account: ExecutionAccount | undefined }[] = [];
  readonly signals: string[] = [];
  failure: string | undefined;
  #finish: ((exit: ChildExit) => void) | undefined;

  readonly fake: FakeHost;
  readonly pid: number;

  constructor(fake: FakeHost, pid = 500) {
    this.fake = fake;
    this.pid = pid;
  }

  async spawn(command: Command, account: ExecutionAccount | undefined): Promise<SpawnResult> {
    this.spawned.push({ command, account });
    if (this.failure !== undefined) return { kind: 'failed', failure: this.failure };
    this.fake.run({ identity: identity(this.pid), parentPid: 100, processGroupId: this.pid });
    const exited = new Promise<ChildExit>((resolve) => (this.#finish = resolve));
    return { kind: 'spawned', pid: this.pid, exited };
  }

  exit(code: number | null, signal: string | null = null): void {
    this.fake.end(this.pid);
    this.#finish?.({ code, signal });
  }

  signalGroup(processGroupId: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    this.signals.push(`${signal} ${processGroupId}`);
  }
}

export interface Rig {
  readonly fake: FakeHost;
  readonly store: MemoryRecordStore;
  readonly lock: MemoryLock;
  readonly spawner: FakeSpawner;
  readonly points: string[];
  readonly supervisor: SupervisorDependencies;
  readonly worker: WorkerSupervisionDependencies;
  readonly started: string[];
}

export const SUPERVISOR_PID = 100;

// Every sleep yields to other tasks, so tests can drive the child meanwhile.
export function rig(platform: 'linux' | 'darwin' = 'darwin', crashPoint: (point: string) => void = () => undefined): Rig {
  const fake = new FakeHost(platform);
  fake.run({ identity: identity(SUPERVISOR_PID), parentPid: 1, processGroupId: SUPERVISOR_PID });
  const store = new MemoryRecordStore();
  const lock = new MemoryLock();
  const spawner = new FakeSpawner(fake);
  const points: string[] = [];
  const started: string[] = [];
  const reach = (point: string) => {
    points.push(point);
    crashPoint(point);
  };
  const sleep = () => new Promise<void>((resolve) => setImmediate(resolve));
  const supervisor: SupervisorDependencies = {
    store,
    lock,
    platform: fake.platform(),
    spawner,
    selfPid: SUPERVISOR_PID,
    timing: { pollMilliseconds: 1, graceMilliseconds: 1, retryMilliseconds: 1 },
    sleep,
    crashPoint: reach,
  };
  const worker: WorkerSupervisionDependencies = {
    store,
    lock,
    platform: fake.platform(),
    startSupervisor: (mode) => {
      started.push(mode);
      return ok(undefined);
    },
    crashPoint: reach,
  };
  return { fake, store, lock, spawner, points, supervisor, worker, started };
}

export async function until(condition: () => boolean, attempts = 1000): Promise<void> {
  for (let attempt = 0; attempt < attempts && !condition(); attempt += 1) await new Promise((resolve) => setImmediate(resolve));
  if (!condition()) throw new Error('the condition was never met');
}
