import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { release, tmpdir, type } from 'node:os';
import {
  ACCEPTANCE_VARIABLE,
  parseAcceptanceContext,
  scenarioRecorderFromEnvironment,
  seedFromEnvironment,
  type AcceptanceContext,
  type AcceptancePlatform,
  type MatrixEntry,
  type ScenarioRecorder,
  type ScenarioRun,
} from '@taskelith/testing';

// The test-side steps of make native-acceptance (G2 item 25b): the matrix
// entry and platform of this host, the context of a proof, and its record.

export const USAGE = 'usage: native-acceptance.ts seed | platform macos|linux'
  + ' | context PLATFORM_FILE ROW PROOF | record SCENARIO SEED TARGET passed|failed DETAIL';

// Runs a program with its arguments and answers its standard output.
export type Run = (file: string, args: readonly string[]) => string;

export interface EntryPlatform {
  readonly entry: MatrixEntry;
  readonly platform: AcceptancePlatform;
}

export interface MacosFacts {
  readonly node: string;
  readonly kernel: string;
  readonly temporaryDirectory: string;
}

export interface LinuxImages {
  readonly base: string;
  readonly testImage: string;
}

export class AcceptanceFailure extends Error {}

const MACOS_MAJOR = '26';
const LINUX_RELEASE = 'Ubuntu 24.04';

// The type of the mount holding $1: stat -f alone names ext4 "ext2/ext3",
// the name of their shared magic number, so it is only the fallback.
export const FILE_SYSTEM_PROBE = 'findmnt -no FSTYPE --target "$1" 2>/dev/null || stat -f -c %T "$1"';

// A macOS 26 host, arm64 or x86_64, with the file system of its temporary
// directory, where the suites and the native worker keep their roots.
export function macosPlatform(run: Run, facts: MacosFacts): EntryPlatform {
  const version = run('sw_vers', ['-productVersion']).trim();
  if (version.split('.')[0] !== MACOS_MAJOR) throw new AcceptanceFailure(`macOS ${version} is not a matrix entry; it needs macOS ${MACOS_MAJOR}`);
  const architecture = matrixArchitecture(run('uname', ['-m']).trim());
  const mountPoint = dfMountPoint(run('df', ['-P', facts.temporaryDirectory]));
  const personality = diskutilField(run('diskutil', ['info', mountPoint]), 'File System Personality');
  return {
    entry: `macos-${MACOS_MAJOR}-${architecture}`,
    platform: {
      os: `macOS ${version} (${run('sw_vers', ['-buildVersion']).trim()})`,
      architecture,
      kernel: facts.kernel,
      filesystem: `${personality} at ${mountPoint}, which holds the temporary directory ${facts.temporaryDirectory}`,
      node: facts.node,
      docker: dockerVersions(run),
    },
  };
}

// The Linux worker entry under this Docker engine: the image's Ubuntu, the
// engine's architecture and kernel, and the file system of a volume.
export function linuxPlatform(run: Run, images: LinuxImages): EntryPlatform {
  const [os, kernel, engineArchitecture, , driver] = run('docker', ['info', '--format',
    '{{.OperatingSystem}}|{{.KernelVersion}}|{{.Architecture}}|{{.ServerVersion}}|{{.Driver}}']).trim().split('|');
  const architecture = matrixArchitecture(engineArchitecture ?? '');
  const distribution = osReleaseName(run('docker', ['run', '--rm', images.base, 'cat', '/etc/os-release']));
  if (!distribution.startsWith(LINUX_RELEASE)) throw new AcceptanceFailure(`${distribution} is not a matrix entry; it needs ${LINUX_RELEASE}`);
  const volume = run('docker', ['run', '--rm', '--volume', '/probe', images.base, 'sh', '-c', FILE_SYSTEM_PROBE, 'sh', '/probe']).trim();
  return {
    entry: `linux-ubuntu-24.04-${architecture}`,
    platform: {
      os: `${distribution} in containers of the pinned base on ${os}`,
      architecture,
      kernel: `Linux ${kernel}`,
      filesystem: `${volume} on Docker volumes (the worker data root and the test container's temporary directory), storage driver ${driver}`,
      node: run('docker', ['run', '--rm', '--entrypoint', 'node', images.testImage, '-v']).trim(),
      docker: dockerVersions(run),
    },
  };
}

export function acceptanceContext({ entry, platform }: EntryPlatform, row: string, proof: string): AcceptanceContext {
  return parseAcceptanceContext(JSON.stringify({ entry, row, proof, platform }));
}

export function matrixArchitecture(machine: string): 'arm64' | 'x86_64' {
  if (machine === 'arm64' || machine === 'aarch64') return 'arm64';
  if (machine === 'x86_64' || machine === 'amd64' || machine === 'x86-64') return 'x86_64';
  throw new AcceptanceFailure(`architecture "${machine}" is not a matrix entry`);
}

// The mount point is the last column of df -P's second line; it may hold
// spaces, so every column after the fifth belongs to it.
export function dfMountPoint(output: string): string {
  const line = output.trim().split('\n')[1];
  const columns = line?.trim().split(/\s+/) ?? [];
  if (columns.length < 6) throw new AcceptanceFailure(`df printed no mount point: ${output.trim()}`);
  return columns.slice(5).join(' ');
}

export function diskutilField(output: string, name: string): string {
  const line = output.split('\n').find((entry) => entry.trim().startsWith(`${name}:`));
  if (line === undefined) throw new AcceptanceFailure(`diskutil printed no ${name}`);
  return line.slice(line.indexOf(':') + 1).trim();
}

export function osReleaseName(output: string): string {
  const line = output.split('\n').find((entry) => entry.startsWith('PRETTY_NAME='));
  if (line === undefined) throw new AcceptanceFailure('the image has no PRETTY_NAME in /etc/os-release');
  return line.slice('PRETTY_NAME='.length).replace(/^"|"$/g, '');
}

function dockerVersions(run: Run): string {
  const engine = run('docker', ['version', '--format', '{{.Server.Platform.Name}} {{.Server.Version}}']).trim();
  return `${engine}; Docker Compose ${run('docker', ['compose', 'version', '--short']).trim()}`;
}

export type AcceptanceCommand =
  | { readonly name: 'seed' }
  | { readonly name: 'platform'; readonly kind: 'macos' | 'linux' }
  | { readonly name: 'context'; readonly platformFile: string; readonly row: string; readonly proof: string }
  | { readonly name: 'record'; readonly run: ScenarioRun };

export function parseAcceptanceCommand(argv: readonly string[]): AcceptanceCommand {
  const [name, ...rest] = argv;
  if (name === 'seed' && rest.length === 0) return { name };
  if (name === 'platform' && rest.length === 1 && (rest[0] === 'macos' || rest[0] === 'linux')) return { name, kind: rest[0] };
  if (name === 'context' && rest.length === 3) return { name, platformFile: rest[0]!, row: rest[1]!, proof: rest[2]! };
  if (name === 'record' && rest.length === 5) {
    const [scenario, seed, target, outcome, detail] = rest as [string, string, string, string, string];
    return { name, run: { scenario, seed: /^\d+$/.test(seed) ? Number(seed) : Number.NaN, target: target as ScenarioRun['target'], outcome: outcome as ScenarioRun['outcome'], detail } };
  }
  throw new AcceptanceFailure(USAGE);
}

export interface AcceptanceDependencies {
  readonly seed: () => number;
  readonly macos: () => EntryPlatform;
  readonly linux: () => EntryPlatform;
  readonly readText: (file: string) => string;
  readonly environment: NodeJS.ProcessEnv;
  readonly recorder: () => ScenarioRecorder;
}

// Returns the text to print, if any.
export async function runAcceptanceCommand(command: AcceptanceCommand, dependencies: AcceptanceDependencies): Promise<string> {
  switch (command.name) {
    case 'seed':
      return String(dependencies.seed());
    case 'platform':
      return JSON.stringify(command.kind === 'macos' ? dependencies.macos() : dependencies.linux());
    case 'context':
      return JSON.stringify(acceptanceContext(JSON.parse(dependencies.readText(command.platformFile)) as EntryPlatform, command.row, command.proof));
    case 'record':
      // A proof record without its matrix entry and row would be unusable.
      if ((dependencies.environment[ACCEPTANCE_VARIABLE] ?? '') === '') throw new AcceptanceFailure(`record needs ${ACCEPTANCE_VARIABLE}`);
      await dependencies.recorder().record(command.run);
      return '';
  }
}

// A failed command's message, with the standard error it printed.
export function failureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const stderr = (error as { stderr?: unknown }).stderr;
  const text = typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf8') : '';
  return text.trim() === '' ? error.message : `${error.message}\n${text.trim()}`;
}

const systemRun: Run = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function required(name: string): string {
  const text = process.env[name];
  if (text === undefined || text === '') throw new AcceptanceFailure(`set ${name}; run through make native-acceptance`);
  return text;
}

function systemDependencies(): AcceptanceDependencies {
  return {
    seed: () => seedFromEnvironment(),
    macos: () => macosPlatform(systemRun, { node: process.version, kernel: `${type()} ${release()}`, temporaryDirectory: tmpdir() }),
    linux: () => linuxPlatform(systemRun, { base: required('TASKELITH_UBUNTU_BASE'), testImage: required('LINUX_TEST_IMAGE') }),
    readText: (file) => readFileSync(file, 'utf8'),
    environment: process.env,
    recorder: () => scenarioRecorderFromEnvironment(),
  };
}

if (import.meta.main) {
  try {
    const output = await runAcceptanceCommand(parseAcceptanceCommand(process.argv.slice(2)), systemDependencies());
    if (output !== '') process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`native-acceptance: ${failureText(error)}\n`);
    process.exitCode = 1;
  }
}
