import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { rootFailure } from './journal-failure.js';

// The durable file rule of the worker journal contract, section 4. On macOS
// Node's fsync uses F_FULLFSYNC first, as section 3 describes.
const TEMPORARY_MARKER = '.tmp-';
const PRIVATE_FILE = 0o600;
const PRIVATE_DIRECTORY = 0o700;

// Flushes a file or directory; an error leaves the device state unknown.
export function syncPath(path: string): Result<void> {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
    return ok(undefined);
  } catch (error) {
    return err(rootFailure('flush-failure', `cannot flush ${path}: ${(error as Error).message}`, { path }));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

// Fails with `conflict` when the name exists; the caller reads that file.
export function createOnce(path: string, content: string): Result<void> {
  return publish(path, content, (temporary) => linkAndDrop(temporary, path));
}

export function replaceFile(path: string, content: string): Result<void> {
  return publish(path, content, (temporary) => renameSync(temporary, path));
}

// A file this process did not make durable is flushed, with its directory
// entry, before anything acts on it (section 4).
export function syncBeforeUse(path: string): Result<void> {
  const file = syncPath(path);
  return file.ok ? syncPath(dirname(path)) : file;
}

export function createPrivateDirectory(path: string): Result<void> {
  try {
    mkdirSync(path, { mode: PRIVATE_DIRECTORY });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code === 'EEXIST' ? 'conflict' : 'internal';
    return err(failure(code, `cannot create ${path}: ${(error as Error).message}`, { path }));
  }
  return syncPath(dirname(path));
}

// A temporary file left by a crash is removed on start and never read.
export function removeTemporaries(directory: string): void {
  for (const name of readdirSync(directory)) {
    if (name.startsWith('.') && name.includes(TEMPORARY_MARKER)) rmSync(join(directory, name), { force: true });
  }
}

function publish(path: string, content: string, place: (temporary: string) => void): Result<void> {
  const temporary = join(dirname(path), `.${basename(path)}${TEMPORARY_MARKER}${randomBytes(8).toString('hex')}`);
  try {
    writeFileSync(temporary, content, { mode: PRIVATE_FILE, flag: 'wx' });
  } catch (error) {
    return err(rootFailure('flush-failure', `cannot write ${temporary}: ${(error as Error).message}`, { path }));
  }
  const synced = syncPath(temporary);
  if (!synced.ok) return synced;
  try {
    place(temporary);
  } catch (error) {
    rmSync(temporary, { force: true });
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return err(failure('conflict', `${path} already exists`, { path }));
  }
  return syncPath(dirname(path));
}

function linkAndDrop(temporary: string, path: string): void {
  linkSync(temporary, path);
  unlinkSync(temporary);
}
