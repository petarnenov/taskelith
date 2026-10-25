import { spawn, type ChildProcess } from 'node:child_process';

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ScenarioProcessOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}

// A child that leads its own process group, so that a kill or pause reaches
// its descendants too, as a crash or a suspended machine would.
export class ScenarioProcess {
  readonly pid: number;
  readonly exited: Promise<ProcessExit>;
  #stdout = '';
  #stderr = '';
  readonly #child: ChildProcess;

  private constructor(child: ChildProcess) {
    this.#child = child;
    this.pid = child.pid!;
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => { this.#stdout += chunk; });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { this.#stderr += chunk; });
    this.exited = new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
    });
  }

  static async start(command: string, args: readonly string[], options: ScenarioProcessOptions = {}): Promise<ScenarioProcess> {
    const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    return new ScenarioProcess(child);
  }

  get stdout(): string {
    return this.#stdout;
  }

  get stderr(): string {
    return this.#stderr;
  }

  kill(signal: NodeJS.Signals = 'SIGKILL'): void {
    process.kill(-this.pid, signal);
  }

  pause(): void {
    this.kill('SIGSTOP');
  }

  resume(): void {
    this.kill('SIGCONT');
  }

  // Resolves once stdout holds the text; rejects if the process closes first.
  waitForOutput(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!this.#stdout.includes(text)) return;
        this.#child.stdout!.off('data', check);
        resolve();
      };
      this.#child.stdout!.on('data', check);
      this.exited.then(() => reject(new Error(`Process ${this.pid} closed before printing "${text}"`)));
      check();
    });
  }
}
