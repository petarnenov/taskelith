import { redactFailure } from '@taskelith/secrets';
import { startControlPlane, type RunningControlPlane } from './composition/control-plane.js';
import { readControlPlaneSettings } from './composition/settings.js';
import type { Environment } from './service-endpoints.js';

// The control-plane service entry that item 23's image runs; it stops on
// SIGTERM or SIGINT and exits with 1 when it cannot start.
export async function controlPlaneMain(environment: Environment, write: (line: string) => void): Promise<RunningControlPlane | undefined> {
  const settings = readControlPlaneSettings(environment, process.platform, process.getuid?.() ?? 0);
  const started = settings.ok ? await startControlPlane(settings.value) : settings;
  if (started.ok) return started.value;
  write(JSON.stringify({ error: redactFailure(started.error) }));
  return undefined;
}

// The part of a process the service entry uses, so a test can stand in.
export interface ServiceProcess {
  on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  off(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  exitCode?: number | string | null | undefined;
}

// The handlers stay until the end, so a repeated signal joins the one stop;
// a loop defect exits non-zero, so a supervisor restarts the service.
export async function serveUntilStopped(running: RunningControlPlane, host: ServiceProcess): Promise<void> {
  const shutdown = () => void running.stop();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) host.on(signal, shutdown);
  const outcome = await running.stopped;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) host.off(signal, shutdown);
  if (outcome === 'failed') host.exitCode = 1;
}

if (import.meta.main) {
  const running = await controlPlaneMain(process.env, (line) => process.stderr.write(`${line}\n`));
  if (running === undefined) process.exitCode = 1;
  else await serveUntilStopped(running, process);
}
