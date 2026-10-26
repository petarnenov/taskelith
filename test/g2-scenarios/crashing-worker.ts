import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { CrashingWorkerArguments } from './fixtures/crash-before-ack-worker.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'crash-before-ack-worker.ts');

// The parent's handle on a crash-before-ack worker process.
export class CrashingWorker {
  readonly workerId: string;
  readonly #child: ChildProcess;
  readonly #exited: Promise<NodeJS.Signals | null>;

  private constructor(workerId: string, child: ChildProcess, exited: Promise<NodeJS.Signals | null>) {
    this.workerId = workerId;
    this.#child = child;
    this.#exited = exited;
  }

  // Resolves once the worker is enrolled and started.
  static async start(parameters: CrashingWorkerArguments): Promise<CrashingWorker> {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', FIXTURE, JSON.stringify(parameters)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exited = once(child, 'exit').then(([, signal]) => signal as NodeJS.Signals | null);
    const lines = createInterface({ input: child.stdout! });
    const [line] = await Promise.race([once(lines, 'line'), exited.then((signal) => {
      throw new Error(`the crashing worker exited before it started (${signal})`);
    })]) as [string];
    return new CrashingWorker((JSON.parse(line) as { workerId: string }).workerId, child, exited);
  }

  // The signal that ended the process.
  exited(): Promise<NodeJS.Signals | null> {
    return this.#exited;
  }

  kill(): void {
    this.#child.kill('SIGKILL');
  }
}
