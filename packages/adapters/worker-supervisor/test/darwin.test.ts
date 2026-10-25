import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  darwinPlatform,
  decodeKinfoProc,
  KINFO_PROC,
  loadDarwinNative,
  type DarwinNative,
  type ProcessEntry,
  type SysctlOutcome,
  type Timebase,
} from '@taskelith/worker-supervisor';

const ENOMEM = 12;
const DARWIN_ONLY = { skip: process.platform !== 'darwin' };

function kinfoProc(entry: { pid: number; parentPid: number; processGroupId: number; seconds: number; microseconds: number }): Buffer {
  const bytes = Buffer.alloc(KINFO_PROC.size);
  bytes.writeBigInt64LE(BigInt(entry.seconds), KINFO_PROC.startSeconds);
  bytes.writeInt32LE(entry.microseconds, KINFO_PROC.startMicroseconds);
  bytes.writeInt32LE(entry.pid, KINFO_PROC.pid);
  bytes.writeInt32LE(entry.parentPid, KINFO_PROC.parentPid);
  bytes.writeInt32LE(entry.processGroupId, KINFO_PROC.processGroupId);
  return bytes;
}

const SELF = kinfoProc({ pid: 700, parentPid: 1, processGroupId: 700, seconds: 1_792_920_095, microseconds: 730_222 });
const CHILD = kinfoProc({ pid: 701, parentPid: 700, processGroupId: 700, seconds: 1_792_920_096, microseconds: 5 });

// The kernel as sysctl(3) shows it: the listing, and the errno of each fill.
class FakeNative implements DarwinNative {
  processes: Buffer[] = [SELF, CHILD];
  fillErrors: number[] = [];
  sizeError = 0;
  ticks = 24_000_000n;
  ticksReadable = true;
  timebaseResult: Result<Timebase> = ok({ numer: 125, denom: 3 });
  readonly calls: string[] = [];

  sysctl(name: readonly number[], buffer: Buffer | undefined): Result<SysctlOutcome> {
    this.calls.push(`${name.join('.')} ${buffer === undefined ? 'size' : 'fill'}`);
    if (name[2] === 1) return ok(this.#one(name[3]!, buffer!));
    const all = Buffer.concat(this.processes);
    if (buffer === undefined) return ok({ errno: this.sizeError, length: all.length });
    const error = this.fillErrors.shift() ?? 0;
    if (error !== 0) return ok({ errno: error, length: 0 });
    all.copy(buffer);
    return ok({ errno: 0, length: Math.min(all.length, buffer.length) });
  }

  continuousTime(): Result<bigint> {
    return this.ticksReadable ? ok(this.ticks) : err(failure('unavailable', 'threw'));
  }

  timebase(): Result<Timebase> {
    return this.timebaseResult;
  }

  #one(pid: number, buffer: Buffer): SysctlOutcome {
    const found = this.processes.find((bytes) => bytes.readInt32LE(KINFO_PROC.pid) === pid);
    if (found === undefined) return { errno: 0, length: 0 };
    found.copy(buffer);
    return { errno: 0, length: found.length };
  }
}

const BOOT_ID = 'boot-1';

function platformWith(native: FakeNative) {
  return { platform: darwinPlatform(ok(native), () => ok(BOOT_ID)), bootId: BOOT_ID };
}

test('a kinfo_proc decodes to the process identity, parent, and group', () => {
  assert.deepEqual(decodeKinfoProc(SELF, 'boot-1'), {
    ok: true,
    value: { identity: { bootId: 'boot-1', pid: 700, startTime: 1_792_920_095_730_222 }, parentPid: 1, processGroupId: 700 },
  });
  assert.equal(decodeKinfoProc(SELF.subarray(1), 'boot-1').ok, false);
  const negative = Buffer.from(SELF);
  negative.writeInt32LE(-1, KINFO_PROC.processGroupId);
  assert.equal(decodeKinfoProc(negative, 'boot-1').ok, false);
});

test('the inspector reads one process and lists all of them', () => {
  const native = new FakeNative();
  const { platform, bootId } = platformWith(native);
  assert.deepEqual(platform.inspector.identity(701), { ok: true, value: { bootId, pid: 701, startTime: 1_792_920_096_000_005 } });
  assert.deepEqual(platform.inspector.identity(999), { ok: true, value: undefined });
  const listing = platform.inspector.listing();
  assert.ok(listing.ok);
  assert.deepEqual(listing.value.map((entry: ProcessEntry) => [entry.identity.pid, entry.parentPid, entry.processGroupId]), [[700, 1, 700], [701, 700, 700]]);
});

test('a listing that grows between the size query and the fill is queried again', () => {
  const native = new FakeNative();
  native.fillErrors = [ENOMEM, ENOMEM];
  const { platform } = platformWith(native);
  assert.equal(platform.inspector.listing().ok, true);
  assert.equal(native.calls.filter((call) => call.endsWith('size')).length, 3);

  native.fillErrors = [ENOMEM, ENOMEM, ENOMEM, ENOMEM, ENOMEM];
  const exhausted = platform.inspector.listing();
  assert.equal(exhausted.ok, false);
  assert.match((exhausted as { error: { message: string } }).error.message, /kept growing over 5 attempts/);
});

test('a failed sysctl or a partial kinfo_proc array is not a listing', () => {
  const native = new FakeNative();
  const { platform } = platformWith(native);
  native.sizeError = 1;
  assert.equal(platform.inspector.listing().ok, false);
  native.sizeError = 0;
  native.fillErrors = [1];
  assert.equal(platform.inspector.listing().ok, false);
  native.processes = [SELF, CHILD.subarray(0, 100)];
  assert.equal(platform.inspector.listing().ok, false);

  native.sysctl = () => ok({ errno: 3, length: 0 });
  assert.equal(platform.inspector.identity(700).ok, false);
  native.sysctl = (_name, buffer) => ok({ errno: 0, length: buffer!.length - 1 });
  assert.equal(platform.inspector.identity(700).ok, false);
  native.sysctl = () => err(failure('unavailable', 'threw'));
  assert.equal(platform.inspector.identity(700).ok, false);
  assert.equal(platform.inspector.listing().ok, false);
  let fills = 0;
  native.sysctl = (_name, buffer) => (buffer === undefined ? ok({ errno: 0, length: 0 }) : ((fills += 1), err(failure('unavailable', 'threw'))));
  assert.equal(platform.inspector.listing().ok, false);
  assert.equal(fills, 1);
});

test('the deadline clock turns continuous ticks into milliseconds', () => {
  const native = new FakeNative();
  const { platform, bootId } = platformWith(native);
  assert.deepEqual(platform.clock.read(), { ok: true, value: { bootId, milliseconds: 1_000 } });
  native.ticks = 2n ** 62n;
  assert.deepEqual(platform.clock.read(), { ok: true, value: { bootId, milliseconds: 192_153_584_101_141 } });
  native.ticksReadable = false;
  assert.equal(platform.clock.read().ok, false);
  native.timebaseResult = err(failure('unavailable', 'no timebase'));
  assert.equal(platform.clock.read().ok, false);
});

test('on macOS the native calls load again in the same process', DARWIN_ONLY, () => {
  assert.equal(loadDarwinNative().ok, true);
  assert.equal(loadDarwinNative().ok, true);
});

test('the boot identity is read once it succeeds, and again after a failure', () => {
  const reads: Result<string>[] = [err(failure('unavailable', 'no sysctl')), ok('boot-2')];
  let count = 0;
  const platform = darwinPlatform(ok(new FakeNative()), () => reads[count++]!);
  assert.equal(platform.inspector.bootId().ok, false);
  assert.deepEqual(platform.inspector.bootId(), { ok: true, value: 'boot-2' });
  assert.deepEqual(platform.clock.read(), { ok: true, value: { bootId: 'boot-2', milliseconds: 1_000 } });
  assert.equal(count, 2);
  const failing = darwinPlatform(ok(new FakeNative()), () => err(failure('unavailable', 'no sysctl')));
  assert.equal(failing.inspector.identity(700).ok, false);
  assert.equal(failing.inspector.listing().ok, false);
  assert.equal(failing.clock.read().ok, false);
});

test('without the native calls every read fails, so the supervisor seals', () => {
  const missing = loadDarwinNative('/nonexistent/libSystem.dylib');
  assert.equal(missing.ok, false);
  const platform = darwinPlatform(missing);
  assert.equal(platform.clock.read().ok, false);
  assert.equal(platform.inspector.identity(1).ok, false);
  assert.equal(platform.inspector.listing().ok, false);
  assert.equal(platform.containment('execution-1'), undefined);
  assert.equal(platform.namespaceIncarnation(), undefined);
});

function ps(pid: number): { parentPid: number; processGroupId: number; started: number } {
  const [parentPid, processGroupId, ...started] = execFileSync('ps', ['-o', 'ppid=,pgid=,lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/);
  return { parentPid: Number(parentPid), processGroupId: Number(processGroupId), started: Date.parse(started.join(' ')) };
}

test('on macOS the native calls read this process as ps does', DARWIN_ONLY, () => {
  const platform = darwinPlatform(loadDarwinNative());
  const expected = ps(process.pid);
  const self = platform.inspector.identity(process.pid);
  assert.ok(self.ok && self.value !== undefined);
  // ps prints the start to the second; p_starttime has microseconds.
  assert.equal(Math.floor(self.value.startTime / 1_000_000), expected.started / 1000);
  assert.deepEqual(platform.inspector.identity(process.pid), self);
  assert.deepEqual(platform.inspector.identity(2 ** 31 - 1), { ok: true, value: undefined });

  const listing = platform.inspector.listing();
  assert.ok(listing.ok);
  const entry = listing.value.find((candidate) => candidate.identity.pid === process.pid);
  assert.deepEqual(entry, { identity: self.value, parentPid: expected.parentPid, processGroupId: expected.processGroupId });
  assert.ok(listing.value.some((candidate) => candidate.identity.pid === 1));
});

test('on macOS the deadline clock advances and follows wall time since boot', DARWIN_ONLY, () => {
  const platform = darwinPlatform(loadDarwinNative());
  const first = platform.clock.read();
  const second = platform.clock.read();
  const bootId = platform.inspector.bootId();
  assert.ok(first.ok && second.ok && bootId.ok);
  assert.equal(first.value.bootId, bootId.value);
  assert.ok(second.value.milliseconds >= first.value.milliseconds);
  const boot = /sec = (\d+)/.exec(execFileSync('sysctl', ['-n', 'kern.boottime'], { encoding: 'utf8' }));
  assert.ok(boot !== null);
  // Wall time since boot includes sleep, as mach_continuous_time does; the
  // boot time has whole seconds and moves with clock corrections.
  assert.ok(Math.abs(Date.now() - Number(boot[1]) * 1000 - second.value.milliseconds) < 30_000);
});
