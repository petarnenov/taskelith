import { open, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export type ReleaseLock = () => Promise<void>;

const POLL_MILLISECONDS = 50;

// Mutual exclusion between test processes, such as test files that share one
// Toxiproxy; a lock whose holder died is taken over.
export async function acquireProcessLock(name: string, timeoutMilliseconds = 120_000): Promise<ReleaseLock> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new RangeError(`Lock name must be lowercase letters, digits, and hyphens, got "${name}"`);
  const path = join(tmpdir(), `taskelith-${name}.lock`);
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await tryCreate(path))) {
    if (await holderIsGone(path)) await unlink(path).catch(() => undefined);
    else if (Date.now() > deadline) throw new Error(`Lock ${name} is still held after ${timeoutMilliseconds} ms (${path})`);
    else await delay(POLL_MILLISECONDS);
  }
  return () => unlink(path).catch(() => undefined);
}

async function tryCreate(path: string): Promise<boolean> {
  try {
    const file = await open(path, 'wx');
    await file.writeFile(String(process.pid));
    await file.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

// A holder that wrote no PID yet is alive; one whose PID is gone is not.
async function holderIsGone(path: string): Promise<boolean> {
  const pid = Number(await readFile(path, 'utf8').catch(() => ''));
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}
