import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { createOnce, createPrivateDirectory, replaceFile, syncBeforeUse, syncPath } from '@taskelith/worker-journal';
import type { CreateOutcome, RecordStore } from './ports.js';

// The marker of the journal adapter's temporary files.
const TEMPORARY = '.tmp-';

// One execution directory under the durable file rule of the worker journal
// contract (section 4), through the helpers of the journal adapter.
export class FileRecordStore implements RecordStore {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async createDirectory(): Promise<Result<void>> {
    const created = createPrivateDirectory(this.directory);
    return created.ok || created.error.code === 'conflict' ? ok(undefined) : created;
  }

  async exists(): Promise<Result<boolean>> {
    try {
      return ok(statSync(this.directory).isDirectory());
    } catch (error) {
      return isMissing(error) ? ok(false) : err(failure('unavailable', `cannot inspect ${this.directory}: ${(error as Error).message}`));
    }
  }

  // Another process may have written the file, so it is flushed with its
  // directory entry before anyone acts on it.
  async read(name: string): Promise<Result<string | undefined>> {
    const path = join(this.directory, name);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      return isMissing(error) ? ok(undefined) : err(failure('unavailable', `cannot read ${path}: ${(error as Error).message}`));
    }
    const synced = syncBeforeUse(path);
    return synced.ok ? ok(text) : synced;
  }

  // Temporary files of an interrupted write start with a dot and are no record.
  async list(): Promise<Result<readonly string[]>> {
    try {
      return ok(readdirSync(this.directory).filter((name) => !name.startsWith('.')));
    } catch (error) {
      return err(failure('unavailable', `cannot list ${this.directory}: ${(error as Error).message}`));
    }
  }

  async createOnce(name: string, text: string): Promise<Result<CreateOutcome>> {
    const created = createOnce(join(this.directory, name), text);
    if (created.ok) return ok('created');
    return created.error.code === 'conflict' ? ok('exists') : created;
  }

  async replace(name: string, text: string): Promise<Result<void>> {
    return replaceFile(join(this.directory, name), text);
  }

  async append(name: string, text: string): Promise<Result<void>> {
    const path = join(this.directory, name);
    const existed = existsSync(path);
    try {
      appendFileSync(path, text, { mode: 0o600 });
      flush(path);
    } catch (error) {
      return err(failure('unavailable', `cannot append to ${path}: ${(error as Error).message}`));
    }
    return existed ? ok(undefined) : syncPath(this.directory);
  }

  async remove(name: string): Promise<Result<void>> {
    try {
      unlinkSync(join(this.directory, name));
      return ok(undefined);
    } catch (error) {
      return isMissing(error) ? ok(undefined) : err(failure('unavailable', `cannot remove ${name}: ${(error as Error).message}`));
    }
  }

  // Temporary files of an interrupted write go too, or the directory stays.
  async removeDirectory(): Promise<Result<void>> {
    try {
      for (const name of readdirSync(this.directory).filter((entry) => entry.startsWith('.') && entry.includes(TEMPORARY))) {
        unlinkSync(join(this.directory, name));
      }
      rmdirSync(this.directory);
    } catch (error) {
      return err(failure('unavailable', `cannot remove ${this.directory}: ${(error as Error).message}`));
    }
    return syncPath(dirname(this.directory));
  }
}

function flush(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
