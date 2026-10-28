import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Best-effort refresh de-duplication: a rare overlap runs two refreshes,
// which is harmless because each writes the cache whole by a rename.

export interface LockOwner {
  readonly pid: number;
  readonly token: string;
}

export interface HeldLock {
  readonly path: string;
  readonly token: string;
}

export type IsAlive = (pid: number) => boolean;

// A lock older than this is abandoned, also when its pid looks alive.
export const LOCK_MAX_AGE_SECONDS = 1800;

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readOwner(path: string): LockOwner | undefined {
  try {
    const owner = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockOwner> | null;
    return Number.isInteger(owner?.pid) && typeof owner?.token === 'string' ? owner as LockOwner : undefined;
  } catch {
    return undefined;
  }
}

function createExclusively(path: string, owner: LockOwner, now: Date): boolean {
  try {
    writeFileSync(path, JSON.stringify({ ...owner, createdAt: now.toISOString() }), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

// An unreadable owner may still be writing its lock, so only age frees it.
function isAbandoned(path: string, now: Date, isAlive: IsAlive): boolean {
  const held = statSync(path, { throwIfNoEntry: false });
  if (held === undefined) return true;
  if ((now.getTime() - held.mtimeMs) / 1000 > LOCK_MAX_AGE_SECONDS) return true;
  const owner = readOwner(path);
  return owner !== undefined && !isAlive(owner.pid);
}

// Returns the lock, or undefined while a live lock younger than the
// maximum age exists; an abandoned lock is removed and created once more.
export function acquireLock(path: string, now: Date, isAlive: IsAlive = processAlive): HeldLock | undefined {
  mkdirSync(dirname(path), { recursive: true });
  const owner = { pid: process.pid, token: randomUUID() };
  if (createExclusively(path, owner, now)) return { path, token: owner.token };
  if (!isAbandoned(path, now, isAlive)) return undefined;
  rmSync(path, { force: true });
  return createExclusively(path, owner, now) ? { path, token: owner.token } : undefined;
}

// Best effort: unlinks the lock only while it still holds this token.
export function releaseLock(lock: HeldLock): boolean {
  if (readOwner(lock.path)?.token !== lock.token) return false;
  rmSync(lock.path, { force: true });
  return true;
}
