import { redactFailure } from '@taskelith/secrets';
import { startControlPlane } from './composition/control-plane.js';
import { readControlPlaneSettings } from './composition/settings.js';
import type { Environment } from './service-endpoints.js';

// The control-plane service entry that item 23's image runs; it stops on
// SIGTERM or SIGINT and exits with 1 when it cannot start.
export async function controlPlaneMain(environment: Environment, write: (line: string) => void): Promise<{ stop(): Promise<void> } | undefined> {
  const settings = readControlPlaneSettings(environment, process.platform, process.getuid?.() ?? 0);
  const started = settings.ok ? await startControlPlane(settings.value) : settings;
  if (started.ok) return started.value;
  write(JSON.stringify({ error: redactFailure(started.error) }));
  return undefined;
}

if (import.meta.main) {
  const running = await controlPlaneMain(process.env, (line) => process.stderr.write(`${line}\n`));
  if (running === undefined) process.exitCode = 1;
  else {
    // stop is idempotent, so a second signal waits for the same shutdown.
    const shutdown = () => running.stop().catch((error: unknown) => {
      process.stderr.write(`${JSON.stringify({ error: { code: 'internal', message: String(error) } })}\n`);
      process.exitCode = 1;
    });
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void shutdown());
  }
}
