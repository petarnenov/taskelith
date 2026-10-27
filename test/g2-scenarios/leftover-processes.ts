import { readdirSync, readFileSync } from 'node:fs';

// Supervisors and scripted processes outlive a stopped worker by design;
// a scenario finds those whose command line names its directory.
export function processesNaming(marker: string): { pid: number; commandLine: string }[] {
  return readdirSync('/proc').filter((entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid)
    .map((entry) => ({ pid: Number(entry), commandLine: commandLine(entry) }))
    .filter((found) => found.commandLine.includes(marker));
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
