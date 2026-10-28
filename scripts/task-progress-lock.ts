import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// The refresh lock: a file naming its owner's process and a token, created
// whole by a hard link, and removed only by its owner or a serial takeover.

export interface LockOwner {
  readonly pid: number;
  readonly token: string;
}

export interface HeldLock {
  readonly path: string;
  readonly token: string;
}

export type IsAlive = (pid: number) => boolean;

// A lock without a readable owner is taken over only after this age.
export const LOCK_TIMEOUT_SECONDS = 300;
// Any lock older than this is abandoned, in case its pid was reused.
export const LOCK_MAX_AGE_SECONDS = 1800;
// A takeover lasts milliseconds; an older takeover file was left behind.
export const TAKEOVER_TIMEOUT_SECONDS = 60;

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

function linkExclusively(source: string, path: string): boolean {
  try {
    linkSync(source, path);
    return true;
  } catch {
    return false;
  }
}

function ageSeconds(path: string, now: Date): number | undefined {
  const held = statSync(path, { throwIfNoEntry: false });
  return held === undefined ? undefined : (now.getTime() - held.mtimeMs) / 1000;
}

function isAbandoned(path: string, owner: LockOwner | undefined, now: Date, isAlive: IsAlive): boolean {
  const age = ageSeconds(path, now);
  if (age === undefined) return true;
  if (owner === undefined) return age > LOCK_TIMEOUT_SECONDS;
  return age > LOCK_MAX_AGE_SECONDS || !isAlive(owner.pid);
}

// Only the holder of the takeover file may remove a lock it did not
// create, so two contenders never both replace one abandoned lock.
function takeOver(path: string, draft: string, now: Date, isAlive: IsAlive): boolean {
  const takeover = `${path}.takeover`;
  if ((ageSeconds(takeover, now) ?? 0) > TAKEOVER_TIMEOUT_SECONDS) rmSync(takeover, { force: true });
  if (!linkExclusively(draft, takeover)) return false;
  try {
    if (!isAbandoned(path, readOwner(path), now, isAlive)) return false;
    rmSync(path, { force: true });
    return linkExclusively(draft, path);
  } finally {
    rmSync(takeover, { force: true });
  }
}

// Returns the held lock, or undefined while a live refresh owns it.
export function acquireLock(path: string, now: Date, isAlive: IsAlive = processAlive): HeldLock | undefined {
  mkdirSync(dirname(path), { recursive: true });
  const token = randomUUID();
  const draft = `${path}.${token}.new`;
  writeFileSync(draft, JSON.stringify({ pid: process.pid, token }));
  try {
    if (linkExclusively(draft, path)) return { path, token };
    if (!isAbandoned(path, readOwner(path), now, isAlive)) return undefined;
    return takeOver(path, draft, now, isAlive) ? { path, token } : undefined;
  } finally {
    rmSync(draft, { force: true });
  }
}

// Removes the lock only while it is still this owner's; a live owner's
// young lock is never taken over, so nothing replaces it in between.
export function releaseLock(lock: HeldLock): boolean {
  if (readOwner(lock.path)?.token !== lock.token) return false;
  rmSync(lock.path, { force: true });
  return true;
}
