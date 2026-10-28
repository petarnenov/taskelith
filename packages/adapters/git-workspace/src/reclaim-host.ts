import { spawn } from 'node:child_process';
import { mkdir, readFile, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ReclaimContainment } from './hand-off-record.js';
import { RECLAIM_PROGRAM_MAIN } from './reclaim-program-main.js';
import { RECLAIM_GO, type ExecutionAccount } from './reclaim-program.js';

export type ReclaimOutcome = 'succeeded' | 'failed';

// A started reclaim program that changes nothing before `go`.
export interface LaunchedReclaim {
  readonly containment: ReclaimContainment;
  // Lets the program run; resolves once it has exited.
  go(): Promise<ReclaimOutcome>;
  // Ends the program before `go`; it exits without a change.
  abandon(): void;
}

// Starts the reclaim program and reads its containment (contract
// section 3); the adapter records, proves, and polls.
export interface ReclaimHost {
  // The shared execution account; null where executions run as the worker.
  readonly executionAccount: ExecutionAccount | null;
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
}

// In a process group of its own, waiting on its input for `go`.
function startProgram(program: ReclaimProgram, args: readonly string[]): Promise<Result<StartedProgram>> {
  return new Promise((started) => {
    const child = spawn(program.executable, [...program.args, ...args], { env: PROGRAM_ENVIRONMENT, stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    const exited = new Promise<ReclaimOutcome>((done) => child.once('close', (code) => done(code === 0 ? 'succeeded' : 'failed')));
    child.stdin.on('error', () => {});
    child.once('error', (error) => started(err(failure('unavailable', `cannot start the reclaim program: ${error.message}`))));
    child.once('spawn', () => started(ok({
      pid: child.pid!,
      go: () => {
        child.stdin.end(RECLAIM_GO);
        return exited;
      },
      abandon: () => void child.stdin.end(),
    })));
  });
}

export interface LinuxReclaimHostOptions {
  // The delegated cgroup that holds the containments.
  readonly containmentParent: string;
  readonly executionAccount: ExecutionAccount;
  readonly program?: ReclaimProgram;
}

// The program enters `<parent>/reclaim-<name>` as root and then runs as
// the execution account; the cgroup's `populated` proves it gone.
export class LinuxReclaimHost implements ReclaimHost {
  readonly executionAccount: ExecutionAccount;
  readonly #parent: string;
  readonly #program: ReclaimProgram;

  constructor(options: LinuxReclaimHostOptions) {
    this.executionAccount = options.executionAccount;
    this.#parent = options.containmentParent;
    this.#program = options.program ?? FIXED_RECLAIM_PROGRAM;
  }

  async launch(checkout: string, containmentName: string): Promise<Result<LaunchedReclaim>> {
    const cgroup = join(this.#parent, containmentName);
    await mkdir(cgroup, { mode: 0o755 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const { uid, gid } = this.executionAccount;
    const args = ['--checkout', checkout, '--cgroup', cgroup, '--uid', String(uid), '--gid', String(gid)];
    const started = await startProgram(this.#program, args);
    return started.ok ? ok({ ...started.value, containment: { kind: 'cgroup', name: containmentName } }) : started;
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

function cgroupName(containment: ReclaimContainment): string {
  if (containment.kind !== 'cgroup') throw new Error('a Linux reclaim containment is a cgroup');
  return containment.name;
}

// Where executions run as the worker's own account, as on macOS: the
// program's process group, empty once no process belongs to it.
export class ProcessGroupReclaimHost implements ReclaimHost {
  readonly executionAccount = null;
  readonly #program: ReclaimProgram;

  constructor(program: ReclaimProgram = FIXED_RECLAIM_PROGRAM) {
    this.#program = program;
  }

  async launch(checkout: string): Promise<Result<LaunchedReclaim>> {
    const started = await startProgram(this.#program, ['--checkout', checkout]);
    return started.ok ? ok({ ...started.value, containment: { kind: 'process-group', id: started.value.pid } }) : started;
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
