import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { isFailureCode, ok, type Failure, type Result } from '@taskelith/kernel';
import { JsonLinesLogSink, SYSTEM_CLOCK } from '@taskelith/node-observability';
import { Logger } from '@taskelith/observability';
import { connectWorkerTransport } from '@taskelith/nats';
import { redactFailure, redactSecrets } from '@taskelith/secrets';
import { HttpEnrollmentClient, HttpLaunchAuthorityClient } from '@taskelith/worker-control-plane-client';
import { hostPlatform } from '@taskelith/worker-supervisor';
import { containmentScan, fileRecordListing, fileSupervision } from './execution-supervision.js';
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
  const logger = new Logger(new JsonLinesLogSink(process.stderr), SYSTEM_CLOCK);
  return {
    enrollment: new HttpEnrollmentClient({ baseUrl: settings.controlPlaneUrl, timeoutMilliseconds: CONTROL_PLANE_TIMEOUT_MILLISECONDS }),
    connect: connectWorkerTransport,
    newJournalId: () => randomBytes(JOURNAL_ID_BYTES).toString('hex'),
    clock: SYSTEM_CLOCK,
    launching: productionLaunching(settings, logger),
    logger,
  };
}

// The supervisor ships in the worker's build, so the worker's package
// version names the supervisor program.
function supervisorVersion(): string {
  return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}

function productionLaunching(settings: WorkerSettings, logger: Logger): LaunchingDependencies {
  const endpoint = { baseUrl: settings.controlPlaneUrl, timeoutMilliseconds: CONTROL_PLANE_TIMEOUT_MILLISECONDS };
  return {
    authority: (credential) => new HttpLaunchAuthorityClient({ ...endpoint, credential }),
    host: (launch, executions) => launchHost(launch, executions, supervisorVersion()),
    sleep: (milliseconds, signal) => delay(milliseconds, undefined, { signal }).catch(() => undefined),
    draw: Math.random,
    newId: randomUUID,
    logger,
    onFailure: reportLaunchFailure,
  };
}

// A failed launch goes to stderr as one line, beside the structured logs.
function reportLaunchFailure(error: unknown): void {
  process.stderr.write(`${launchFailureLine(error)}\n`);
}

// A journal or record failure keeps its code; a thrown error its message.
// Formatting never throws: anything it cannot render is a plain line.
export function launchFailureLine(error: unknown): string {
  try {
    if (isFailure(error)) return JSON.stringify({ error: redactFailure(error) });
    return internalLine(redactSecrets(`a launch failed: ${messageOf(error)}`));
  } catch {
    return internalLine('a launch failed');
  }
}

function internalLine(message: string): string {
  return JSON.stringify({ error: { code: 'internal', message } });
}

function messageOf(error: unknown): string {
  const { message } = (typeof error === 'object' && error !== null ? error : {}) as { message?: unknown };
  return typeof message === 'string' ? message : String(error);
}

function isFailure(value: unknown): value is Failure {
  const { code, message, details } = (value ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  return typeof code === 'string' && isFailureCode(code) && typeof message === 'string'
    && typeof details === 'object' && details !== null && Object.values(details).every((detail) => typeof detail === 'string');
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
  const containments = containmentScan(platform.value, containmentParent);
  return ok({
    clock: platform.value.clock,
    supervision: fileSupervision({ executions, platform: platform.value, program }),
    records: fileRecordListing(executions),
    ...(containments === undefined ? {} : { containments }),
  });
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
