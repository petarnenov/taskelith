import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// The refresh lock: a file naming its owner's process and a token, created
// whole by a hard link, and removed only by its owner or from a dead one.

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

// Moves the lock aside and keeps it there only when it is still the one
// expected; another lock goes back, so no contender removes a new one.
function takeAside(path: string, aside: string, expected: string | undefined): boolean {
  try {
    renameSync(path, aside);
  } catch {
    return false;
  }
  if (readOwner(aside)?.token === expected) return true;
  linkExclusively(aside, path);
  rmSync(aside, { force: true });
  return false;
}

function isAbandoned(path: string, owner: LockOwner | undefined, now: Date, isAlive: IsAlive): boolean {
  if (owner !== undefined) return !isAlive(owner.pid);
  const held = statSync(path, { throwIfNoEntry: false });
  return held !== undefined && now.getTime() - held.mtimeMs > LOCK_TIMEOUT_SECONDS * 1000;
}

// Returns the held lock, or undefined while a live refresh owns it.
export function acquireLock(path: string, now: Date, isAlive: IsAlive = processAlive): HeldLock | undefined {
  mkdirSync(dirname(path), { recursive: true });
  const token = randomUUID();
  const draft = `${path}.${token}.new`;
  writeFileSync(draft, JSON.stringify({ pid: process.pid, token }));
  try {
    if (linkExclusively(draft, path)) return { path, token };
    const owner = readOwner(path);
    if (!isAbandoned(path, owner, now, isAlive)) return undefined;
    const aside = `${path}.${token}.stale`;
    if (!takeAside(path, aside, owner?.token)) return undefined;
    rmSync(aside, { force: true });
    return linkExclusively(draft, path) ? { path, token } : undefined;
  } finally {
    rmSync(draft, { force: true });
  }
}

// Removes the lock only while it is still this owner's.
export function releaseLock(lock: HeldLock): boolean {
  const aside = `${lock.path}.${lock.token}.release`;
  if (!takeAside(lock.path, aside, lock.token)) return false;
  rmSync(aside, { force: true });
  return true;
}
