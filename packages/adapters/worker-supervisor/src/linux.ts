import { readFileSync, readdirSync, readlinkSync, writeFileSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProcessEntry, ProcessIdentity } from './process-identity.js';
import type { Containment, DeadlineClock, DeadlineReading, Platform, ProcessInspector } from './ports.js';

export interface ProcStat {
  readonly pid: number;
  readonly parentPid: number;
  readonly processGroupId: number;
  readonly startTime: number;
}

// Fields 1, 4, 5, and 22 of /proc/<pid>/stat; the command in field 2 may hold
// spaces and parentheses, so fields are counted after its last ")".
export function parseProcStat(text: string): Result<ProcStat> {
  const close = text.lastIndexOf(')');
  const fields = close < 0 ? [] : text.slice(close + 2).trim().split(' ');
  const values = [text.slice(0, text.indexOf(' ')), fields[1], fields[2], fields[19]].map(Number);
  if (fields.length < 20 || !values.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return err(failure('invalid', 'not a /proc/<pid>/stat line'));
  }
  const [pid, parentPid, processGroupId, startTime] = values as [number, number, number, number];
  return ok({ pid, parentPid, processGroupId, startTime });
}

// The first field of /proc/uptime is CLOCK_BOOTTIME in seconds, which counts
// suspended time.
export function parseUptime(text: string): Result<number> {
  const match = /^(\d+)\.(\d{2})\s/.exec(text);
  if (match === null) return err(failure('invalid', 'not a /proc/uptime line'));
  return ok(Number(match[1]) * 1000 + Number(match[2]) * 10);
}

// The current cgroup of a process from /proc/<pid>/cgroup (cgroup v2 only).
export function parseCgroup(text: string): Result<string> {
  const match = /^0::(\/\S*)$/m.exec(text);
  return match === null ? err(failure('unavailable', 'no cgroup v2 membership')) : ok(match[1]!);
}

function readText(path: string): Result<string | undefined> {
  try {
    return ok(readFileSync(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH') return ok(undefined);
    return err(failure('unavailable', `cannot read ${path}: ${(error as Error).message}`));
  }
}

function required(path: string): Result<string> {
  const text = readText(path);
  if (!text.ok) return text;
  return text.value === undefined ? err(failure('unavailable', `${path} is missing`)) : ok(text.value);
}

function write(path: string, text: string): Result<void> {
  try {
    writeFileSync(path, text);
    return ok(undefined);
  } catch (error) {
    return err(failure('unavailable', `cannot write ${path}: ${(error as Error).message}`));
  }
}

export class LinuxProcessInspector implements ProcessInspector {
  readonly #proc: string;

  constructor(proc = '/proc') {
    this.#proc = proc;
  }

  bootId(): Result<string> {
    const text = required(join(this.#proc, 'sys/kernel/random/boot_id'));
    return text.ok ? ok(text.value.trim()) : text;
  }

  identity(pid: number): Result<ProcessIdentity | undefined> {
    const entry = this.entry(pid);
    return entry.ok ? ok(entry.value?.identity) : entry;
  }

  // A running process with its group, or undefined if none has the ID.
  entry(pid: number): Result<ProcessEntry | undefined> {
    const boot = this.bootId();
    return boot.ok ? this.#entry(pid, boot.value) : boot;
  }

  // Not one instant on Linux: termination evidence there is the containment.
  listing(): Result<readonly ProcessEntry[]> {
    const boot = this.bootId();
    if (!boot.ok) return boot;
    let names: string[];
    try {
      names = readdirSync(this.#proc).filter((entry) => /^\d+$/.test(entry));
    } catch (error) {
      return err(failure('unavailable', `cannot list ${this.#proc}: ${(error as Error).message}`));
    }
    const entries: ProcessEntry[] = [];
    for (const name of names) {
      const entry = this.#entry(Number(name), boot.value);
      if (!entry.ok) return entry;
      if (entry.value !== undefined) entries.push(entry.value);
    }
    return ok(entries);
  }

  #entry(pid: number, bootId: string): Result<ProcessEntry | undefined> {
    const text = readText(join(this.#proc, String(pid), 'stat'));
    if (!text.ok || text.value === undefined) return text.ok ? ok(undefined) : text;
    const stat = parseProcStat(text.value);
    if (!stat.ok) return stat;
    const identity = { bootId, pid: stat.value.pid, startTime: stat.value.startTime };
    return ok({ identity, parentPid: stat.value.parentPid, processGroupId: stat.value.processGroupId });
  }
}

export class LinuxDeadlineClock implements DeadlineClock {
  readonly #proc: string;
  readonly #inspector: ProcessInspector;

  constructor(inspector: ProcessInspector, proc = '/proc') {
    this.#proc = proc;
    this.#inspector = inspector;
  }

  read(): Result<DeadlineReading> {
    const boot = this.#inspector.bootId();
    if (!boot.ok) return boot;
    const text = required(join(this.#proc, 'uptime'));
    const milliseconds = text.ok ? parseUptime(text.value) : text;
    return milliseconds.ok ? ok({ bootId: boot.value, milliseconds: milliseconds.value }) : milliseconds;
  }
}

// One cgroup v2 directory per execution, named from its executionId, under a
// delegated parent that holds no processes of its own.
export class LinuxContainment implements Containment {
  readonly path: string;
  readonly #home: string;

  constructor(parent: string, executionId: string, home: string) {
    this.path = join(parent, executionId);
    this.#home = home;
  }

  create(): Result<void> {
    try {
      mkdirSync(this.path, { mode: 0o755 });
      return ok(undefined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return ok(undefined);
      return err(failure('unavailable', `cannot create ${this.path}: ${(error as Error).message}`));
    }
  }

  admit(pid: number): Result<void> {
    return write(join(this.path, 'cgroup.procs'), String(pid));
  }

  release(pid: number): Result<void> {
    return write(join(this.#home, 'cgroup.procs'), String(pid));
  }

  populated(): Result<boolean> {
    const text = required(join(this.path, 'cgroup.events'));
    return text.ok ? parsePopulated(text.value) : text;
  }

  kill(): Result<void> {
    return write(join(this.path, 'cgroup.kill'), '1');
  }

  remove(): Result<void> {
    try {
      rmdirSync(this.path);
      return ok(undefined);
    } catch (error) {
      return err(failure('unavailable', `cannot remove ${this.path}: ${(error as Error).message}`));
    }
  }
}

// `cgroup.events` counts descendant cgroups too.
function parsePopulated(events: string): Result<boolean> {
  const match = /^populated ([01])$/m.exec(events);
  return match === null ? err(failure('unavailable', 'cgroup.events has no populated line')) : ok(match[1] === '1');
}

// A populated containment, by its directory name, with its members.
export interface PopulatedCgroup {
  readonly name: string;
  readonly path: string;
  readonly processes: readonly ProcessEntry[];
}

// The populated containments under the delegated parent; a child creates no
// cgroup (supervisor identity 8), so `cgroup.procs` holds the whole set.
export class LinuxContainmentScan {
  readonly #parent: string;
  readonly #inspector: LinuxProcessInspector;

  constructor(parent: string, inspector: LinuxProcessInspector) {
    this.#parent = parent;
    this.#inspector = inspector;
  }

  // One unreadable containment never hides the others: one of unknown state
  // is skipped, and a populated one with unreadable members has none listed.
  populated(): Result<readonly PopulatedCgroup[]> {
    const names = this.#names();
    if (!names.ok) return names;
    const found: PopulatedCgroup[] = [];
    for (const name of names.value) {
      const path = join(this.#parent, name);
      const populated = this.#populated(path);
      if (!populated.ok || !populated.value) continue;
      const processes = this.#members(path);
      found.push({ name, path, processes: processes.ok ? processes.value : [] });
    }
    return ok(found);
  }

  // A containment removed since the listing is empty.
  #populated(path: string): Result<boolean> {
    const text = readText(join(path, 'cgroup.events'));
    if (!text.ok) return text;
    return text.value === undefined ? ok(false) : parsePopulated(text.value);
  }

  // A missing parent holds no containment.
  #names(): Result<readonly string[]> {
    try {
      return ok(readdirSync(this.#parent, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok([]);
      return err(failure('unavailable', `cannot list ${this.#parent}: ${(error as Error).message}`));
    }
  }

  // A member that exits before it is read is left out.
  #members(path: string): Result<readonly ProcessEntry[]> {
    const text = readText(join(path, 'cgroup.procs'));
    if (!text.ok) return text;
    const members: ProcessEntry[] = [];
    for (const line of (text.value ?? '').split('\n').filter((member) => member !== '')) {
      const pid = /^\d+$/.test(line) ? Number(line) : 0;
      if (!Number.isSafeInteger(pid) || pid < 1) return err(failure('invalid', `${path}/cgroup.procs names no process`));
      const entry = this.#inspector.entry(pid);
      if (!entry.ok) return entry;
      if (entry.value !== undefined) members.push(entry.value);
    }
    return ok(members);
  }
}

export interface LinuxPlatformOptions {
  readonly proc?: string;
  readonly cgroupRoot?: string;
  // The delegated cgroup under which containments are created.
  readonly containmentParent: string;
}

export function linuxPlatform(options: LinuxPlatformOptions): Platform {
  const proc = options.proc ?? '/proc';
  const cgroupRoot = options.cgroupRoot ?? '/sys/fs/cgroup';
  const inspector = new LinuxProcessInspector(proc);
  return {
    name: 'linux',
    clock: new LinuxDeadlineClock(inspector, proc),
    inspector,
    containment(executionId) {
      const text = required(join(proc, 'self/cgroup'));
      const home = text.ok ? parseCgroup(text.value) : text;
      if (!home.ok) return home;
      return ok(new LinuxContainment(options.containmentParent, executionId, join(cgroupRoot, home.value)));
    },
    namespaceIncarnation() {
      return namespaceIncarnation(proc, inspector);
    },
  };
}

// The PID namespace and the start of its PID 1: an inode alone may be reused
// by a later namespace.
function namespaceIncarnation(proc: string, inspector: ProcessInspector): Result<string> {
  try {
    const namespace = readlinkSync(join(proc, 'self/ns/pid'));
    const init = inspector.identity(1);
    if (!init.ok) return init;
    if (init.value === undefined) return err(failure('unavailable', 'no PID 1 in this namespace'));
    return ok(`${namespace}@${init.value.bootId}/${init.value.startTime}`);
  } catch (error) {
    return err(failure('unavailable', `cannot read the PID namespace: ${(error as Error).message}`));
  }
}
