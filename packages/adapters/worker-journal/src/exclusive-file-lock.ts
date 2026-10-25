import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { rootFailure } from './journal-failure.js';
import { isSqliteError, SQLITE_BUSY, SQLITE_NOTADB } from './sqlite-errors.js';

// Marks a lock file as a Taskelith lock: "TKLK".
export const LOCK_APPLICATION_ID = 0x544b4c4b;
const LOCK_FORMAT = 1;

// A kernel-released exclusive lock, held through SQLite's exclusive locking
// mode, because Node offers no flock (worker journal contract, section 9).
export class ExclusiveFileLock {
  // A POSIX record lock: closing any other descriptor of the file in this
  // process releases it, so nothing else in the process may open the file.
  readonly #database: DatabaseSync;

  private constructor(database: DatabaseSync) {
    this.#database = database;
  }

  // Takes the lock without waiting; `root-locked` means a live holder.
  static acquire(path: string): Result<ExclusiveFileLock> {
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(path, { timeout: 0 });
      database.exec('PRAGMA locking_mode = EXCLUSIVE');
      database.exec('BEGIN EXCLUSIVE');
      const marked = markLockFile(database);
      database.exec('COMMIT');
      if (!marked.ok) {
        database.close();
        return marked;
      }
      chmodSync(path, 0o600);
      return ok(new ExclusiveFileLock(database));
    } catch (error) {
      database?.close();
      if (isSqliteError(error, SQLITE_BUSY)) return err(rootFailure('root-locked', `${path} is held by another process`, { path }));
      if (isSqliteError(error, SQLITE_NOTADB)) return err(rootFailure('corrupt', `${path} is not a Taskelith lock`, { path }));
      return err(failure('internal', `cannot lock ${path}: ${(error as Error).message}`, { path }));
    }
  }

  release(): void {
    if (this.#database.isOpen) this.#database.close();
  }
}

function markLockFile(database: DatabaseSync): Result<void> {
  const applicationId = Number(database.prepare('PRAGMA application_id').get()?.application_id);
  if (applicationId === 0) {
    database.exec(`PRAGMA application_id = ${LOCK_APPLICATION_ID}`);
    database.exec(`PRAGMA user_version = ${LOCK_FORMAT}`);
    return ok(undefined);
  }
  if (applicationId !== LOCK_APPLICATION_ID) return err(rootFailure('corrupt', 'the lock file is not a Taskelith lock'));
  const format = Number(database.prepare('PRAGMA user_version').get()?.user_version);
  if (format > LOCK_FORMAT) return err(rootFailure('newer-format', `lock format ${format} is newer than ${LOCK_FORMAT}`));
  return ok(undefined);
}
