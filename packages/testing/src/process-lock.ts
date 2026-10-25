import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export type ReleaseLock = () => Promise<void>;

const POLL_MILLISECONDS = 50;
const FIRST_PORT = 23_000;
const PORT_COUNT = 2_000;

// Mutual exclusion between test processes, such as files that share one
// Toxiproxy: holding a loopback port, which the OS frees when a holder dies.
export async function acquireProcessLock(name: string, timeoutMilliseconds = 120_000): Promise<ReleaseLock> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new RangeError(`Lock name must be lowercase letters, digits, and hyphens, got "${name}"`);
  const port = lockPort(name);
  const deadline = Date.now() + timeoutMilliseconds;
  for (;;) {
    const server = await tryListen(port);
    if (server) return () => new Promise((resolve) => server.close(() => resolve()));
    if (Date.now() > deadline) throw new Error(`Lock ${name} (port ${port}) is still held after ${timeoutMilliseconds} ms`);
    await delay(POLL_MILLISECONDS);
  }
}

// Names map to ports below the usual ephemeral ranges; two names that share
// a port only wait for each other.
export function lockPort(name: string): number {
  return FIRST_PORT + (createHash('sha256').update(name).digest().readUInt32BE(0) % PORT_COUNT);
}

function tryListen(port: number): Promise<Server | undefined> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => (error.code === 'EADDRINUSE' ? resolve(undefined) : reject(error)));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.unref();
      resolve(server);
    });
  });
}
