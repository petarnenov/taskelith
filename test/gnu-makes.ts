import { spawnSync } from 'node:child_process';

// Each distinct GNU make on PATH, so that a host whose make is 3.81 also
// tests make 4.4 when it has it as gmake, for example from Homebrew.
export const gnuMakes: readonly string[] = distinctByVersion(['make', 'gmake']);

function distinctByVersion(commands: readonly string[]): string[] {
  const versions = new Set<string>();
  return commands.filter((command) => {
    const version = versionOf(command);
    if (version === undefined || versions.has(version)) return false;
    versions.add(version);
    return true;
  });
}

function versionOf(command: string): string | undefined {
  const run = spawnSync(command, ['--version'], { encoding: 'utf8' });
  const firstLine = run.status === 0 ? run.stdout.split('\n')[0] : '';
  return firstLine?.startsWith('GNU Make') ? firstLine : undefined;
}
