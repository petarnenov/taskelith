import type { Result } from '@taskelith/kernel';
import type { ProcessEntry, ProcessIdentity } from './process-identity.js';
import type { Command, ExecutionAccount } from './record.js';

// A reading of the clock that counts suspended time, in one boot.
export interface DeadlineReading {
  readonly bootId: string;
  readonly milliseconds: number;
}

// CLOCK_BOOTTIME on Linux, mach_continuous_time on macOS; a clock that
// cannot be read fails, and the supervisor then seals (contract section 4).
export interface DeadlineClock {
  read(): Result<DeadlineReading>;
}

export interface ProcessInspector {
  bootId(): Result<string>;
  // The identity of a running process, or undefined if none has the ID.
  identity(pid: number): Result<ProcessIdentity | undefined>;
  // Every process in one kernel listing, whose IDs are taken at one instant.
  listing(): Result<readonly ProcessEntry[]>;
}

// The cgroup v2 directory of one execution (Linux only).
export interface Containment {
  readonly path: string;
  create(): Result<void>;
  admit(pid: number): Result<void>;
  release(pid: number): Result<void>;
  populated(): Result<boolean>;
  kill(): Result<void>;
  remove(): Result<void>;
}

export interface Platform {
  readonly name: 'linux' | 'darwin';
  readonly clock: DeadlineClock;
  readonly inspector: ProcessInspector;
  containment(executionId: string): Result<Containment> | undefined;
  namespaceIncarnation(): Result<string> | undefined;
}

export interface ChildExit {
  readonly code: number | null;
  readonly signal: string | null;
}

export type SpawnResult =
  | { readonly kind: 'spawned'; readonly pid: number; readonly exited: Promise<ChildExit> }
  | { readonly kind: 'failed'; readonly failure: string };

export interface Spawner {
  // Starts the child as the leader of a new session and process group.
  spawn(command: Command, account: ExecutionAccount | undefined): Promise<SpawnResult>;
  signalGroup(processGroupId: number, signal: 'SIGTERM' | 'SIGKILL'): void;
}

export type CreateOutcome = 'created' | 'exists';

// The files of one execution record under the durable file rule of the
// worker journal contract, section 4.
export interface RecordStore {
  // The worker creates the directory; a supervisor never does (section 3).
  createDirectory(): Promise<Result<void>>;
  exists(): Promise<Result<boolean>>;
  read(name: string): Promise<Result<string | undefined>>;
  list(): Promise<Result<readonly string[]>>;
  createOnce(name: string, text: string): Promise<Result<CreateOutcome>>;
  replace(name: string, text: string): Promise<Result<void>>;
  append(name: string, text: string): Promise<Result<void>>;
  remove(name: string): Promise<Result<void>>;
  removeDirectory(): Promise<Result<void>>;
}

export interface HeldLock {
  release(): void;
}

// The execution's `lock`, taken without waiting; only this port opens it.
export interface ExecutionLock {
  tryAcquire(): Result<HeldLock | undefined>;
}
