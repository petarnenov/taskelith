import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

export interface NamedProcess {
  readonly pid: number;
  readonly commandLine: string;
}

// Supervisors and scripted processes outlive a stopped worker by design;
// a scenario finds those whose command line names its directory.
export function processesNaming(marker: string): NamedProcess[] {
  const listed = process.platform === 'darwin' ? psProcesses() : procProcesses();
  return listed.filter((found) => found.pid !== process.pid && found.commandLine.includes(marker));
}

function procProcesses(): NamedProcess[] {
  return readdirSync('/proc').filter((entry) => /^\d+$/.test(entry))
    .map((entry) => ({ pid: Number(entry), commandLine: commandLine(entry) }));
}

// macOS has no /proc; ps prints each process's whole argument list.
function psProcesses(): NamedProcess[] {
  return parsePsListing(execFileSync('ps', ['-axww', '-o', 'pid=,args='], { encoding: 'utf8' }));
}

export function parsePsListing(listing: string): NamedProcess[] {
  return listing.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s(.*)$/.exec(line);
    return match === null ? [] : [{ pid: Number(match[1]), commandLine: match[2]! }];
  });
}

export function killProcessesNaming(marker: string): number {
  let killed = 0;
  for (const { pid } of processesNaming(marker)) {
    try {
      process.kill(pid, 'SIGKILL');
      killed += 1;
    } catch {
      // Already gone.
    }
  }
  return killed;
}

function commandLine(pid: string): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8');
  } catch {
    return '';
  }
}
