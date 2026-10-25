import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { ok, type Result } from '@taskelith/kernel';
import { SYSTEM_CLOCK } from '@taskelith/node-observability';
import { connectWorkerTransport } from '@taskelith/nats';
import { redactFailure, redactSecrets } from '@taskelith/secrets';
import { HttpEnrollmentClient, HttpLaunchAuthorityClient } from '@taskelith/worker-control-plane-client';
import { hostPlatform } from '@taskelith/worker-supervisor';
import { fileSupervision } from './execution-supervision.js';
import {
  CONTROL_PLANE_TIMEOUT_MILLISECONDS,
  currentHost,
  readWorkerSettings,
  type Environment,
  type LaunchSettings,
  type WorkerSettings,
} from './settings.js';
import { startWorker, type LaunchHost, type LaunchingDependencies, type RunningWorker, type WorkerDependencies } from './worker-start.js';

// A journal identity is 128 random bits (worker journal contract sec. 8).
const JOURNAL_ID_BYTES = 16;

export function productionDependencies(settings: WorkerSettings): WorkerDependencies {
  return {
    enrollment: new HttpEnrollmentClient({ baseUrl: settings.controlPlaneUrl, timeoutMilliseconds: CONTROL_PLANE_TIMEOUT_MILLISECONDS }),
    connect: connectWorkerTransport,
    newJournalId: () => randomBytes(JOURNAL_ID_BYTES).toString('hex'),
    clock: SYSTEM_CLOCK,
    launching: productionLaunching(settings),
  };
}

// The supervisor ships in the worker's build, so the worker's package
// version names the supervisor program.
function supervisorVersion(): string {
  return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}

function productionLaunching(settings: WorkerSettings): LaunchingDependencies {
  const endpoint = { baseUrl: settings.controlPlaneUrl, timeoutMilliseconds: CONTROL_PLANE_TIMEOUT_MILLISECONDS };
  return {
    authority: (credential) => new HttpLaunchAuthorityClient({ ...endpoint, credential }),
    host: (launch, executions) => launchHost(launch, executions, supervisorVersion()),
    sleep: (milliseconds, signal) => delay(milliseconds, undefined, { signal }).catch(() => undefined),
    draw: Math.random,
    newId: randomUUID,
    onFailure: reportLaunchFailure,
  };
}

// The worker has no logger yet (20d), so a failed launch goes to stderr.
function reportLaunchFailure(error: unknown): void {
  const message = redactSecrets(`a launch failed: ${String(error)}`);
  process.stderr.write(`${JSON.stringify({ error: { code: 'internal', message } })}\n`);
}

function launchHost(launch: LaunchSettings, executions: string, version: string): Result<LaunchHost> {
  const platform = hostPlatform(launch.containmentParent);
  if (!platform.ok) return platform;
  const { command, containmentParent, executionAccount } = launch;
  const program = {
    command, supervisorVersion: version,
    ...(containmentParent === undefined ? {} : { containmentParent }),
    ...(executionAccount === undefined ? {} : { executionAccount }),
  };
  return ok({ clock: platform.value.clock, supervision: fileSupervision({ executions, platform: platform.value, program }) });
}

// The worker entry that item 23's image runs; it exits with 1 when it cannot
// start, and a process supervisor restarts it.
export async function workerMain(
  environment: Environment,
  write: (line: string) => void,
  dependenciesOf: (settings: WorkerSettings) => WorkerDependencies = productionDependencies,
): Promise<RunningWorker | undefined> {
  const settings = readWorkerSettings(environment, currentHost());
  const started = settings.ok ? await startWorker(settings.value, dependenciesOf(settings.value)) : settings;
  if (started.ok) return started.value;
  write(JSON.stringify({ error: redactFailure(started.error) }));
  return undefined;
}

// The part of a process the worker entry uses, so a test can stand in.
export interface ServiceProcess {
  on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  off(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  exitCode?: number | string | null | undefined;
}

// A failed close still settles `stopped`; it is reported and makes the
// exit status 1 instead of becoming an unhandled rejection.
export async function serveUntilStopped(worker: RunningWorker, host: ServiceProcess, write: (line: string) => void): Promise<void> {
  let stopping: Promise<void> | undefined;
  const shutdown = () => {
    stopping ??= worker.stop().catch((error: unknown) => {
      write(JSON.stringify({ error: { code: 'internal', message: redactSecrets(`stopping the worker failed: ${String(error)}`) } }));
      host.exitCode = 1;
    });
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) host.on(signal, shutdown);
  await worker.stopped;
  await stopping;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) host.off(signal, shutdown);
}

if (import.meta.main) {
  const writeLine = (line: string) => void process.stderr.write(`${line}\n`);
  const worker = await workerMain(process.env, writeLine);
  if (worker === undefined) process.exitCode = 1;
  else await serveUntilStopped(worker, process, writeLine);
}
