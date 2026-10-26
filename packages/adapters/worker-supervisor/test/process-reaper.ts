import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import type { ScenarioProcess } from '@taskelith/testing';

// The longest a real-process test may run before it fails as timed out.
export const REAL_PROCESS_TEST_TIMEOUT = 30_000;

const REAP_BOUND_MILLISECONDS = 5_000;
const RESCAN_MILLISECONDS = 25;
const PS_OUTPUT_BYTES = 16 * 1024 * 1024;
const PS_COLUMNS = ['-o', 'pid=,stat=,command='];
const runFile = promisify(execFile);

// Kills what a real-process test started, so that a failed assertion fails
// the test instead of leaving a supervisor that holds the runner open.
export class ProcessReaper {
  readonly #marker: string;
  readonly #scenarios = new Set<ScenarioProcess>();

  // Every process a test starts names the marker, a unique temporary path,
  // on its command line; no other process can name it.
  constructor(marker: string) {
    this.#marker = marker;
  }

  track(scenario: ScenarioProcess): ScenarioProcess {
    this.#scenarios.add(scenario);
    return scenario;
  }

  async reap(): Promise<void> {
    const killed = await killMarked(this.#marker);
    const unclosed = await Promise.all([...this.#scenarios].map(closed));
    this.#scenarios.clear();
    const errors = [...killed, ...unclosed.flat()];
    if (errors.length > 0) throw new AggregateError(errors, 'the test teardown left processes behind');
  }
}

// Repeats until none is left, since a dying supervisor may still spawn.
async function killMarked(marker: string): Promise<Error[]> {
  const deadline = Date.now() + REAP_BOUND_MILLISECONDS;
  try {
    for (let marked = await markedProcesses(marker, deadline); marked.length > 0; marked = await markedProcesses(marker, deadline)) {
      if (Date.now() > deadline) return [new Error(`processes ${marked.join(', ')} survived SIGKILL`)];
      const errors = (await Promise.all(marked.map((pid) => killIfMarked(pid, marker, deadline)))).flat();
      if (errors.length > 0) return errors;
      await delay(RESCAN_MILLISECONDS);
    }
    return [];
  } catch (error) {
    return [error as Error];
  }
}

async function closed(scenario: ScenarioProcess): Promise<Error[]> {
  const bound = delay(REAP_BOUND_MILLISECONDS, 'open' as const, { ref: false });
  const outcome = await Promise.race([scenario.exited.then(() => 'closed' as const), bound]);
  return outcome === 'closed' ? [] : [new Error(`process ${scenario.pid} did not close within ${REAP_BOUND_MILLISECONDS} ms`)];
}

// Checked again just before the signal, so that a process ID taken over
// since the scan is spared; only the check-to-kill gap remains.
async function killIfMarked(pid: number, marker: string, deadline: number): Promise<Error[]> {
  if (!(await markedProcesses(marker, deadline, pid)).includes(pid)) return [];
  try {
    process.kill(pid, 'SIGKILL');
    return [];
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? [] : [error as Error];
  }
}

// Live processes only: a zombie is already dead and cannot be killed.
async function markedProcesses(marker: string, deadline: number, pid?: number): Promise<number[]> {
  const marked = process.platform === 'linux' ? linuxMarked(marker, pid) : await psMarked(marker, deadline, pid);
  return marked.filter((candidate) => candidate !== process.pid);
}

async function psMarked(marker: string, deadline: number, pid?: number): Promise<number[]> {
  const listing = pid === undefined ? await ps(['-axww', ...PS_COLUMNS], deadline) : await psOne(pid, deadline);
  return listing.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    return match && !match[2]!.startsWith('Z') && match[3]!.includes(marker) ? [Number(match[1])] : [];
  });
}

// `ps -p` exits with 1 when the process is gone; any other failure counts.
async function psOne(pid: number, deadline: number): Promise<string> {
  try {
    return await ps(['-ww', '-p', String(pid), ...PS_COLUMNS], deadline);
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return '';
    throw error;
  }
}

async function ps(args: readonly string[], deadline: number): Promise<string> {
  const timeout = Math.max(1, deadline - Date.now());
  return (await runFile('ps', args, { encoding: 'utf8', timeout, maxBuffer: PS_OUTPUT_BYTES })).stdout;
}

function linuxMarked(marker: string, pid?: number): number[] {
  const pids = pid === undefined ? readdirSync('/proc').filter((name) => /^\d+$/.test(name)).map(Number) : [pid];
  return pids.filter((candidate) => linuxNamesMarker(candidate, marker));
}

function linuxNamesMarker(pid: number, marker: string): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    if (stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')) return false;
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(marker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
