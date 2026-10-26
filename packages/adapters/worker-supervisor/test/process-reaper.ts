import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { ScenarioProcess } from '@taskelith/testing';

// The longest a real-process test may run before it fails as timed out.
export const REAL_PROCESS_TEST_TIMEOUT = 30_000;

const REAP_BOUND_MILLISECONDS = 5_000;
const RESCAN_MILLISECONDS = 25;

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
    const errors = await killMarked(this.#marker);
    await Promise.all([...this.#scenarios].map(closed));
    this.#scenarios.clear();
    if (errors.length > 0) throw new AggregateError(errors, 'the test teardown left processes behind');
  }
}

// Repeats until none is left, since a dying supervisor may still spawn.
async function killMarked(marker: string): Promise<Error[]> {
  const deadline = Date.now() + REAP_BOUND_MILLISECONDS;
  try {
    for (let marked = markedProcesses(marker); marked.length > 0; marked = markedProcesses(marker)) {
      const errors = marked.flatMap(kill);
      if (errors.length > 0) return errors;
      if (Date.now() > deadline) return [new Error(`processes ${marked.join(', ')} survived SIGKILL`)];
      await delay(RESCAN_MILLISECONDS);
    }
    return [];
  } catch (error) {
    return [error as Error];
  }
}

function closed(scenario: ScenarioProcess): Promise<unknown> {
  return Promise.race([scenario.exited, delay(REAP_BOUND_MILLISECONDS, undefined, { ref: false })]);
}

function kill(pid: number): Error[] {
  try {
    process.kill(pid, 'SIGKILL');
    return [];
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? [] : [error as Error];
  }
}

// Live processes only: a zombie is already dead and cannot be killed.
function markedProcesses(marker: string): number[] {
  const marked = process.platform === 'linux' ? linuxMarked(marker) : psMarked(marker);
  return marked.filter((pid) => pid !== process.pid);
}

function psMarked(marker: string): number[] {
  const listing = execFileSync('ps', ['-axww', '-o', 'pid=,stat=,command='], { encoding: 'utf8' });
  return listing.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    return match && !match[2]!.startsWith('Z') && match[3]!.includes(marker) ? [Number(match[1])] : [];
  });
}

function linuxMarked(marker: string): number[] {
  const pids = readdirSync('/proc').filter((name) => /^\d+$/.test(name)).map(Number);
  return pids.filter((pid) => linuxNamesMarker(pid, marker));
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
