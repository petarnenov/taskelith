import { randomBytes } from 'node:crypto';
import { SYSTEM_CLOCK } from '@taskelith/node-observability';
import { connectWorkerTransport } from '@taskelith/nats';
import { redactFailure } from '@taskelith/secrets';
import { HttpEnrollmentClient } from '@taskelith/worker-control-plane-client';
import { CONTROL_PLANE_TIMEOUT_MILLISECONDS, currentHost, readWorkerSettings, type Environment, type WorkerSettings } from './settings.js';
import { startWorker, type RunningWorker, type WorkerDependencies } from './worker-start.js';

// A journal identity is 128 random bits (worker journal contract sec. 8).
const JOURNAL_ID_BYTES = 16;

export function productionDependencies(settings: WorkerSettings): WorkerDependencies {
  return {
    enrollment: new HttpEnrollmentClient({ baseUrl: settings.controlPlaneUrl, timeoutMilliseconds: CONTROL_PLANE_TIMEOUT_MILLISECONDS }),
    connect: connectWorkerTransport,
    newJournalId: () => randomBytes(JOURNAL_ID_BYTES).toString('hex'),
    clock: SYSTEM_CLOCK,
    ownerUid: process.getuid?.() ?? -1,
  };
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
}

// A failed close still settles `stopped`; it is not rethrown at shutdown.
export async function serveUntilStopped(worker: RunningWorker, host: ServiceProcess): Promise<void> {
  const shutdown = () => void worker.stop().catch(() => undefined);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) host.on(signal, shutdown);
  await worker.stopped;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) host.off(signal, shutdown);
}

if (import.meta.main) {
  const worker = await workerMain(process.env, (line) => process.stderr.write(`${line}\n`));
  if (worker === undefined) process.exitCode = 1;
  else await serveUntilStopped(worker, process);
}
