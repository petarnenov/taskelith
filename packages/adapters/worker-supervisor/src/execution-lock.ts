import { join } from 'node:path';
import { ok, type Result } from '@taskelith/kernel';
import { ExclusiveFileLock, failureReason } from '@taskelith/worker-journal';
import type { ExecutionLock, HeldLock } from './ports.js';
import { RECORD_FILES } from './record.js';

// The execution `lock` as the exclusive SQLite lock of the journal adapter
// (decision D-B (a)); this class is the only code that opens the file.
export class SqliteExecutionLock implements ExecutionLock {
  readonly #path: string;

  constructor(directory: string) {
    this.#path = join(directory, RECORD_FILES.lock);
  }

  tryAcquire(): Result<HeldLock | undefined> {
    const acquired = ExclusiveFileLock.acquire(this.#path);
    if (acquired.ok) return ok({ release: () => acquired.value.release() });
    return failureReason(acquired.error) === 'root-locked' ? ok(undefined) : acquired;
  }
}
