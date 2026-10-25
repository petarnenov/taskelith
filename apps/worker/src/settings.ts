import { readFileSync } from 'node:fs';
import { availableParallelism, hostname, totalmem } from 'node:os';
import { resolveDataRoot } from '@taskelith/data-root';
import type { HostArchitecture, HostPlatform, WorkerCapacity, WorkerHost } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { TransportTls } from '@taskelith/nats';
import type { Command, ExecutionAccount } from '@taskelith/worker-supervisor';

export type Environment = Readonly<Record<string, string | undefined>>;

// The operational targets' default slots and daemon memory ceiling.
export const DEFAULT_SLOTS = 2;
export const DAEMON_MEMORY_MEBIBYTES = 512;
export const CONTROL_PLANE_TIMEOUT_MILLISECONDS = 10_000;

export interface WorkerSettings {
  readonly dataRoot: string;
  readonly controlPlaneUrl: URL;
  readonly natsUrl: URL;
  readonly natsTls?: TransportTls;
  // Used only by the first start, which enrolls the worker with it.
  readonly enrollmentToken?: string;
  readonly host: WorkerHost;
  readonly capacity: WorkerCapacity;
  // Without it the worker accepts assignments but launches none.
  readonly launch?: LaunchSettings;
}

// The program a launch runs (a test-only scripted process in G2) and, on
// Linux, the delegated cgroup and the account the child runs as.
export interface LaunchSettings {
  readonly command: Command;
  readonly containmentParent?: string;
  readonly executionAccount?: ExecutionAccount;
}

export interface HostFacts {
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly hostname: string;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
}

export function currentHost(): HostFacts {
  return {
    platform: process.platform, architecture: process.arch, hostname: hostname(),
    cpuMillicores: availableParallelism() * 1000, memoryMebibytes: Math.floor(totalmem() / 2 ** 20),
  };
}

// The worker's settings from its environment; a failure names the
// variable, never its value.
export function readWorkerSettings(environment: Environment, facts: HostFacts): Result<WorkerSettings> {
  const dataRoot = resolveDataRoot({ environment, platform: facts.platform });
  if (!dataRoot.ok) return dataRoot;
  const controlPlaneUrl = readUrl(environment, 'TASKELITH_CONTROL_PLANE_URL', ['http:', 'https:']);
  if (!controlPlaneUrl.ok) return controlPlaneUrl;
  const natsUrl = readUrl(environment, 'TASKELITH_NATS_URL', ['nats:']);
  if (!natsUrl.ok) return natsUrl;
  const ca = readCa(environment.TASKELITH_NATS_CA);
  if (!ca.ok) return ca;
  const host = workerHost(facts);
  if (!host.ok) return host;
  const capacity = readCapacity(environment, facts);
  if (!capacity.ok) return capacity;
  const launch = readLaunch(environment, facts.platform);
  if (!launch.ok) return launch;
  const token = environment.TASKELITH_ENROLLMENT_TOKEN;
  return ok({
    dataRoot: dataRoot.value, controlPlaneUrl: controlPlaneUrl.value, natsUrl: natsUrl.value, host: host.value, capacity: capacity.value,
    ...(launch.value === undefined ? {} : { launch: launch.value }),
    ...(ca.value === undefined ? {} : { natsTls: { ca: ca.value } }),
    ...(token === undefined || token === '' ? {} : { enrollmentToken: token }),
  });
}

function readUrl(environment: Environment, variable: string, protocols: readonly string[]): Result<URL> {
  const text = environment[variable];
  const invalid = err(failure('invalid', `${variable} must be a ${protocols.join(' or ')} URL`, { variable }));
  if (text === undefined || !URL.canParse(text)) return invalid;
  const url = new URL(text);
  return protocols.includes(url.protocol) ? ok(url) : invalid;
}

function readCa(path: string | undefined): Result<string | undefined> {
  if (path === undefined || path === '') return ok(undefined);
  try {
    return ok(readFileSync(path, 'utf8'));
  } catch {
    return err(failure('invalid', 'TASKELITH_NATS_CA must name a readable PEM file', { variable: 'TASKELITH_NATS_CA' }));
  }
}

const PLATFORMS: readonly string[] = ['linux', 'darwin'];
const ARCHITECTURES: readonly string[] = ['x64', 'arm64'];

function workerHost(facts: HostFacts): Result<WorkerHost> {
  if (!PLATFORMS.includes(facts.platform) || !ARCHITECTURES.includes(facts.architecture)) {
    return err(failure('precondition-failed', `a worker runs on linux or darwin, x64 or arm64, not ${facts.platform} ${facts.architecture}`));
  }
  return ok({ platform: facts.platform as HostPlatform, architecture: facts.architecture as HostArchitecture, hostname: facts.hostname });
}

// The host's capacity less the daemon's own memory, unless configured; no
// hard control is declared until the supervisor enforces one.
function readCapacity(environment: Environment, facts: HostFacts): Result<WorkerCapacity> {
  const slots = readCount(environment, 'TASKELITH_WORKER_SLOTS', DEFAULT_SLOTS);
  if (!slots.ok) return slots;
  const cpuMillicores = readCount(environment, 'TASKELITH_WORKER_CPU_MILLICORES', facts.cpuMillicores);
  if (!cpuMillicores.ok) return cpuMillicores;
  const hostMemory = Math.max(1, facts.memoryMebibytes - DAEMON_MEMORY_MEBIBYTES);
  const memoryMebibytes = readCount(environment, 'TASKELITH_WORKER_MEMORY_MEBIBYTES', hostMemory);
  if (!memoryMebibytes.ok) return memoryMebibytes;
  return ok({ slots: slots.value, cpuMillicores: cpuMillicores.value, memoryMebibytes: memoryMebibytes.value, controls: [] });
}

const MAXIMUM_COUNT = 2_147_483_647;

function readCount(environment: Environment, variable: string, fallback: number): Result<number> {
  const text = environment[variable];
  if (text === undefined || text === '') return ok(fallback);
  const count = Number(text);
  if (/^\d+$/.test(text) && count >= 1 && count <= MAXIMUM_COUNT) return ok(count);
  return err(failure('invalid', `${variable} must be a positive integer`, { variable }));
}

// The launch settings; the Linux ones are read only on Linux.
function readLaunch(environment: Environment, platform: NodeJS.Platform): Result<LaunchSettings | undefined> {
  const command = readCommand(environment.TASKELITH_WORKER_COMMAND);
  if (!command.ok) return command;
  if (command.value === undefined) return ok(undefined);
  if (platform !== 'linux') return ok({ command: command.value });
  const parent = environment.TASKELITH_CONTAINMENT_PARENT;
  if (parent === undefined || !parent.startsWith('/')) {
    return err(failure('invalid', 'TASKELITH_CONTAINMENT_PARENT must be an absolute path', { variable: 'TASKELITH_CONTAINMENT_PARENT' }));
  }
  const uid = readAccountId(environment, 'TASKELITH_EXECUTION_UID');
  if (!uid.ok) return uid;
  const gid = readAccountId(environment, 'TASKELITH_EXECUTION_GID');
  if (!gid.ok) return gid;
  return ok({ command: command.value, containmentParent: parent, executionAccount: { uid: uid.value, gid: gid.value } });
}

const COMMAND_INVALID = failure('invalid', 'TASKELITH_WORKER_COMMAND must be a JSON array of the executable and its arguments', {
  variable: 'TASKELITH_WORKER_COMMAND',
});

function readCommand(text: string | undefined): Result<Command | undefined> {
  if (text === undefined || text === '') return ok(undefined);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err(COMMAND_INVALID);
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((part) => typeof part === 'string' && part !== '')) {
    return err(COMMAND_INVALID);
  }
  const [executable, ...rest] = parsed as string[];
  return ok({ executable: executable as string, arguments: rest });
}

// The execution account owns no cgroup of the worker, so it is never root.
function readAccountId(environment: Environment, variable: string): Result<number> {
  const text = environment[variable];
  const id = Number(text);
  if (text !== undefined && /^\d+$/.test(text) && id >= 1 && id <= MAXIMUM_COUNT) return ok(id);
  return err(failure('invalid', `${variable} must be a positive integer`, { variable }));
}
