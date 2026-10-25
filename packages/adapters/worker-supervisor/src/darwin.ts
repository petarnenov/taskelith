import { execFileSync } from 'node:child_process';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProcessEntry, ProcessIdentity } from './process-identity.js';
import type { DeadlineClock, DeadlineReading, Platform, ProcessInspector } from './ports.js';

export interface SysctlOutcome {
  // 0 on success, else the errno that sysctl(3) set.
  readonly errno: number;
  // The bytes written, or without a buffer the bytes needed.
  readonly length: number;
}

export interface Timebase {
  readonly numer: number;
  readonly denom: number;
}

// The libSystem calls the macOS readers need, so that a reader without a
// foreign function interface stays possible.
export interface DarwinNative {
  sysctl(name: readonly number[], buffer: Buffer | undefined): SysctlOutcome;
  continuousTime(): bigint;
  timebase(): Result<Timebase>;
}

const CTL_KERN = 1;
const KERN_PROC = 14;
const KERN_PROC_ALL = 0;
const KERN_PROC_PID = 1;
const ENOMEM = 12;
const LISTING_ATTEMPTS = 5;

// struct kinfo_proc of the macOS 26 SDK, equal on arm64 and x86_64.
export const KINFO_PROC = Object.freeze({
  size: 648,
  startSeconds: 0,
  startMicroseconds: 8,
  pid: 40,
  parentPid: 560,
  processGroupId: 564,
});

// The start time is p_starttime in microseconds since the epoch.
export function decodeKinfoProc(bytes: Buffer, bootId: string): Result<ProcessEntry> {
  if (bytes.length !== KINFO_PROC.size) return err(failure('invalid', `a kinfo_proc has ${KINFO_PROC.size} bytes, not ${bytes.length}`));
  const seconds = bytes.readBigInt64LE(KINFO_PROC.startSeconds);
  const startTime = Number(seconds * 1_000_000n + BigInt(bytes.readInt32LE(KINFO_PROC.startMicroseconds)));
  const identity = { bootId, pid: bytes.readInt32LE(KINFO_PROC.pid), startTime };
  const parentPid = bytes.readInt32LE(KINFO_PROC.parentPid);
  const processGroupId = bytes.readInt32LE(KINFO_PROC.processGroupId);
  const values = [identity.pid, startTime, parentPid, processGroupId];
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) return err(failure('invalid', 'not a kinfo_proc'));
  return ok({ identity, parentPid, processGroupId });
}

function decodeKinfoProcs(bytes: Buffer, bootId: string): Result<readonly ProcessEntry[]> {
  if (bytes.length % KINFO_PROC.size !== 0) return err(failure('invalid', `${bytes.length} bytes hold no whole kinfo_proc array`));
  const entries: ProcessEntry[] = [];
  for (let offset = 0; offset < bytes.length; offset += KINFO_PROC.size) {
    const entry = decodeKinfoProc(bytes.subarray(offset, offset + KINFO_PROC.size), bootId);
    if (!entry.ok) return entry;
    entries.push(entry.value);
  }
  return ok(entries);
}

function sysctlFailure(name: string, errno: number): Result<never> {
  return err(failure('unavailable', `sysctl ${name} failed with errno ${errno}`));
}

export class DarwinProcessInspector implements ProcessInspector {
  readonly #native: Result<DarwinNative>;

  constructor(native: Result<DarwinNative>) {
    this.#native = native;
  }

  bootId(): Result<string> {
    try {
      return ok(execFileSync('sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8' }).trim());
    } catch (error) {
      return err(failure('unavailable', `cannot read kern.bootsessionuuid: ${(error as Error).message}`));
    }
  }

  identity(pid: number): Result<ProcessIdentity | undefined> {
    if (!this.#native.ok) return this.#native;
    const boot = this.bootId();
    if (!boot.ok) return boot;
    const buffer = Buffer.alloc(KINFO_PROC.size);
    const outcome = this.#native.value.sysctl([CTL_KERN, KERN_PROC, KERN_PROC_PID, pid], buffer);
    if (outcome.errno !== 0) return sysctlFailure('KERN_PROC_PID', outcome.errno);
    if (outcome.length === 0) return ok(undefined);
    const entry = decodeKinfoProc(buffer.subarray(0, outcome.length), boot.value);
    return entry.ok ? ok(entry.value.identity) : entry;
  }

  // The kernel takes the process IDs at one instant and copies each entry
  // later; the list may grow between the size query and the fill.
  listing(): Result<readonly ProcessEntry[]> {
    if (!this.#native.ok) return this.#native;
    const boot = this.bootId();
    if (!boot.ok) return boot;
    const name = [CTL_KERN, KERN_PROC, KERN_PROC_ALL];
    for (let attempt = 0; attempt < LISTING_ATTEMPTS; attempt += 1) {
      const size = this.#native.value.sysctl(name, undefined);
      if (size.errno !== 0) return sysctlFailure('KERN_PROC_ALL', size.errno);
      const buffer = Buffer.alloc(size.length);
      const filled = this.#native.value.sysctl(name, buffer);
      if (filled.errno === ENOMEM) continue;
      if (filled.errno !== 0) return sysctlFailure('KERN_PROC_ALL', filled.errno);
      return decodeKinfoProcs(buffer.subarray(0, filled.length), boot.value);
    }
    return err(failure('unavailable', `the process list kept growing over ${LISTING_ATTEMPTS} attempts`));
  }
}

// mach_continuous_time counts time asleep; the timebase turns its ticks
// into nanoseconds.
export class DarwinDeadlineClock implements DeadlineClock {
  readonly #native: Result<DarwinNative>;
  readonly #inspector: ProcessInspector;

  constructor(native: Result<DarwinNative>, inspector: ProcessInspector) {
    this.#native = native;
    this.#inspector = inspector;
  }

  read(): Result<DeadlineReading> {
    if (!this.#native.ok) return this.#native;
    const boot = this.#inspector.bootId();
    if (!boot.ok) return boot;
    const timebase = this.#native.value.timebase();
    if (!timebase.ok) return timebase;
    const nanoseconds = this.#native.value.continuousTime() * BigInt(timebase.value.numer) / BigInt(timebase.value.denom);
    return ok({ bootId: boot.value, milliseconds: Number(nanoseconds / 1_000_000n) });
  }
}

// A native reader that fails to load fails every read, so the supervisor
// seals every launch.
export function darwinPlatform(native: Result<DarwinNative>): Platform {
  const inspector = new DarwinProcessInspector(native);
  return {
    name: 'darwin',
    clock: new DarwinDeadlineClock(native, inspector),
    inspector,
    containment: () => undefined,
    namespaceIncarnation: () => undefined,
  };
}
