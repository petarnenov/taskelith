import { randomBytes } from 'node:crypto';
import { link, open, rename, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { dataRootFailure } from './data-root-failure.js';
import { TEMPORARY_MARKER } from './durable-file.js';

// The durable file rule of durable-file.ts without blocking the event loop,
// for large content in a serving process.
const PRIVATE_FILE = 0o600;

export async function syncPathAsync(path: string): Promise<Result<void>> {
  try {
    const handle = await open(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    return ok(undefined);
  } catch (error) {
    return err(dataRootFailure('flush-failure', `cannot flush ${path}: ${(error as Error).message}`, { path }));
  }
}

// Fails with `conflict` when the name exists; the caller reads that file.
export function createOnceAsync(path: string, content: Uint8Array): Promise<Result<void>> {
  return publish(path, content, async (temporary) => {
    await link(temporary, path);
    await unlink(temporary);
  });
}

export function replaceFileAsync(path: string, content: Uint8Array): Promise<Result<void>> {
  return publish(path, content, (temporary) => rename(temporary, path));
}

async function publish(path: string, content: Uint8Array, place: (temporary: string) => Promise<void>): Promise<Result<void>> {
  const temporary = join(dirname(path), `.${basename(path)}${TEMPORARY_MARKER}${randomBytes(8).toString('hex')}`);
  try {
    const handle = await open(temporary, 'wx', PRIVATE_FILE);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rm(temporary, { force: true });
    return err(dataRootFailure('flush-failure', `cannot write ${temporary}: ${(error as Error).message}`, { path }));
  }
  try {
    await place(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return err(failure('conflict', `${path} already exists`, { path }));
  }
  return syncPathAsync(dirname(path));
}
