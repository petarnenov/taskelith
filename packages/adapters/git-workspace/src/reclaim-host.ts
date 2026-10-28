import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ReclaimContainment } from './hand-off-record.js';
import { RECLAIM_PROGRAM_MAIN } from './reclaim-program-main.js';
import { RECLAIM_EXIT, RECLAIM_GO, RECLAIM_READY, type ExecutionAccount } from './reclaim-program.js';

// `abandoned`: the program got no `go` in its window and changed nothing.
export type ReclaimOutcome = 'succeeded' | 'failed' | 'abandoned';

// A reclaim program in its containment, as its account, that changes
// nothing before `go`.
export interface LaunchedReclaim {
  readonly containment: ReclaimContainment;
  // Lets the program run; resolves once it has exited.
  go(): Promise<ReclaimOutcome>;
  // Ends the program before `go`; it exits without a change.
  abandon(): void;
  // Kills every process of the containment after the run bound or a
  // failure; the adapter then proves it empty (contract section 3).
  kill(): Promise<void>;
}

// Starts the reclaim program and reads its containment (contract
// section 3); the adapter records, proves, and polls.
export interface ReclaimHost {
  // The shared execution account; null where executions run as the worker.
  readonly executionAccount: ExecutionAccount | null;
  // Resolves once the program has signalled that it is ready.
  launch(checkout: string, containmentName: string): Promise<Result<LaunchedReclaim>>;
  // Whether a process of the containment still runs; a fault rejects.
  populated(containment: ReclaimContainment): Promise<boolean>;
  // Frees what `launch` made, once the containment is proven empty.
  release(containment: ReclaimContainment): Promise<void>;
}

// The program and the arguments before the reclaim's own; a test may
// inject another, as it injects the Git client pin.
export interface ReclaimProgram {
  readonly executable: string;
  readonly args: readonly string[];
}

export const FIXED_RECLAIM_PROGRAM: ReclaimProgram = Object.freeze({ executable: process.execPath, args: [RECLAIM_PROGRAM_MAIN] });

// Nothing of the worker's environment; Node adds no coverage variable.
const PROGRAM_ENVIRONMENT = { PATH: '/usr/bin:/bin', LC_ALL: 'C', NODE_V8_COVERAGE: undefined };

interface StartedProgram {
  readonly pid: number;
  go(): Promise<ReclaimOutcome>;
  abandon(): void;
  killGroup(): void;
}

interface ProgramStart {
  readonly started: Result<StartedProgram>;
  // Resolves once the program has exited, also after a failed start.
  readonly exited: Promise<ReclaimOutcome>;
}

// How long `launch` waits for the ready signal (contract section 3).
export const RECLAIM_READY_BOUND_MS = 60_000;

// In a process group of its own; started once it signals that it is
// ready, so a spawned program never counts before it is contained.
function startProgram(program: ReclaimProgram, args: readonly string[], readyBoundMs: number): Promise<ProgramStart> {
  return new Promise((resolve) => {
    const child = spawn(program.executable, [...program.args, ...args], { env: PROGRAM_ENVIRONMENT, stdio: ['pipe', 'pipe', 'ignore'], detached: true });
    const exited = new Promise<ReclaimOutcome>((done) => child.once('close', (code) => done(outcomeOf(code))));
    const started = (result: Result<StartedProgram>) => resolve({ started: result, exited });
    const abandon = () => void child.stdin.end();
    child.stdin.on('error', () => {});
    child.once('error', (error) => started(err(failure('unavailable', `cannot start the reclaim program: ${error.message}`))));
    void readiness(child.stdout, readyBoundMs).then((state) => {
      if (state !== 'ready') {
        abandon();
        return started(err(failure('unavailable', NOT_READY[state])));
      }
      started(ok({
        pid: child.pid!,
        go: () => {
          child.stdin.end(RECLAIM_GO);
          return exited;
        },
        abandon,
        killGroup: () => killUnreapedGroup(child),
      }));
    });
  });
}

// Only while Node has not reaped the leader, so its group identifier
// cannot belong to another group yet; a reaped leader's group is not killed.
function killUnreapedGroup(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid!, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

type Readiness = 'ready' | 'ended' | 'late';

const NOT_READY = {
  ended: 'the reclaim program ended before it was ready',
  late: 'the reclaim program was not ready within its bound',
} as const;

// `ready` once the output starts with the ready signal, `ended` if it
// ends first, `late` at the bound; the rest of the output is drained.
function readiness(output: NodeJS.ReadableStream, boundMs: number): Promise<Readiness> {
  return new Promise((resolve) => {
    let received = '';
    const settle = (state: Readiness) => {
      clearTimeout(bound);
      resolve(state);
    };
    const bound = setTimeout(() => settle('late'), boundMs);
    const signalled = () => (received.startsWith(RECLAIM_READY) ? 'ready' : 'ended');
    output.setEncoding('utf8');
    output.on('data', (chunk: string) => {
      received += chunk;
      if (received.length >= RECLAIM_READY.length) settle(signalled());
    });
    output.once('end', () => settle(signalled()));
    output.once('error', () => settle('ended'));
  });
}

function outcomeOf(code: number | null): ReclaimOutcome {
  if (code === RECLAIM_EXIT.done) return 'succeeded';
  return code === RECLAIM_EXIT.abandoned ? 'abandoned' : 'failed';
}

export interface LinuxReclaimHostOptions {
  // The delegated cgroup that holds the containments.
  readonly containmentParent: string;
  readonly executionAccount: ExecutionAccount;
  readonly program?: ReclaimProgram;
  // `RECLAIM_READY_BOUND_MS` unless a test sets a shorter one.
  readonly readyBoundMs?: number;
}

// The program enters `<parent>/reclaim-<name>` as root and then runs as
// the execution account; the cgroup's `populated` proves it gone.
export class LinuxReclaimHost implements ReclaimHost {
  readonly executionAccount: ExecutionAccount;
  readonly #parent: string;
  readonly #program: ReclaimProgram;
  readonly #readyBoundMs: number;

  constructor(options: LinuxReclaimHostOptions) {
    this.executionAccount = options.executionAccount;
    this.#parent = options.containmentParent;
    this.#program = options.program ?? FIXED_RECLAIM_PROGRAM;
    this.#readyBoundMs = options.readyBoundMs ?? RECLAIM_READY_BOUND_MS;
  }

  async launch(checkout: string, containmentName: string): Promise<Result<LaunchedReclaim>> {
    const cgroup = join(this.#parent, containmentName);
    await mkdir(cgroup, { mode: 0o755 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const { uid, gid } = this.executionAccount;
    const args = ['--checkout', checkout, '--cgroup', cgroup, '--uid', String(uid), '--gid', String(gid)];
    const { started, exited } = await startProgram(this.#program, args, this.#readyBoundMs);
    if (started.ok) {
      const { go, abandon } = started.value;
      return ok({ containment: { kind: 'cgroup', name: containmentName }, go, abandon, kill: () => killCgroup(cgroup) });
    }
    await removeIfEmpty(cgroup);
    // A program still in its cgroup frees it on exit; a fault keeps it.
    void exited.then(() => removeIfEmpty(cgroup)).catch(() => {});
    return started;
  }

  // A cgroup that is gone holds no process.
  async populated(containment: ReclaimContainment): Promise<boolean> {
    const events = await readFile(join(this.#parent, cgroupName(containment), 'cgroup.events'), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (events === undefined) return false;
    const match = /^populated ([01])$/m.exec(events);
    if (match === null) throw new Error('cgroup.events has no populated line');
    return match[1] === '1';
  }

  async release(containment: ReclaimContainment): Promise<void> {
    await rmdir(join(this.#parent, cgroupName(containment))).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

// `cgroup.kill` kills every process of the cgroup and its descendants; a
// cgroup that is gone holds none.
async function killCgroup(cgroup: string): Promise<void> {
  await writeFile(join(cgroup, 'cgroup.kill'), '1').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

// The kernel refuses to remove a populated cgroup (`EBUSY`), so only an
// empty one goes; a program still in it keeps it for the next proof.
async function removeIfEmpty(cgroup: string): Promise<void> {
  await rmdir(cgroup).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT' && error.code !== 'EBUSY') throw error;
  });
}

function cgroupName(containment: ReclaimContainment): string {
  if (containment.kind !== 'cgroup') throw new Error('a Linux reclaim containment is a cgroup');
  return containment.name;
}

// Where executions run as the worker's own account, as on macOS: the
// program's process group, empty once no process belongs to it.
export class ProcessGroupReclaimHost implements ReclaimHost {
  readonly executionAccount = null;
  readonly #program: ReclaimProgram;
  readonly #readyBoundMs: number;

  constructor(program: ReclaimProgram = FIXED_RECLAIM_PROGRAM, readyBoundMs = RECLAIM_READY_BOUND_MS) {
    this.#program = program;
    this.#readyBoundMs = readyBoundMs;
  }

  async launch(checkout: string): Promise<Result<LaunchedReclaim>> {
    const { started } = await startProgram(this.#program, ['--checkout', checkout], this.#readyBoundMs);
    if (!started.ok) return started;
    const { pid, go, abandon, killGroup } = started.value;
    return ok({ containment: { kind: 'process-group', id: pid }, go, abandon, kill: async () => killGroup() });
  }

  async populated(containment: ReclaimContainment): Promise<boolean> {
    if (containment.kind !== 'process-group') throw new Error('a one-account reclaim containment is a process group');
    try {
      process.kill(-containment.id, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') return false;
      if (code === 'EPERM') return true;
      throw error;
    }
  }

  async release(): Promise<void> {}
}
