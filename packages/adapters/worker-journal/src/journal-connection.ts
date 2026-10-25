import type { DatabaseSync } from 'node:sqlite';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import { rootFailure } from './journal-failure.js';
import {
  SQLITE_CANTOPEN,
  SQLITE_CORRUPT,
  SQLITE_FULL,
  SQLITE_IOERR,
  SQLITE_NOTADB,
  SQLITE_PROTOCOL,
  SQLITE_READONLY,
  sqliteCode,
} from './sqlite-errors.js';

// The file or its device is gone or unusable, so its state is unknown.
const DEVICE_FAULTS: ReadonlySet<number> = new Set([SQLITE_IOERR, SQLITE_CANTOPEN, SQLITE_READONLY, SQLITE_PROTOCOL]);

// The part of node:sqlite the journal uses, so tests can inject I/O errors.
export type JournalDatabase = Pick<DatabaseSync, 'exec' | 'prepare' | 'close' | 'isOpen'>;

// Runs each protocol write as one `BEGIN IMMEDIATE` transaction and fails
// closed after a flush failure or corruption (contract sections 7 and 8).
export class JournalConnection {
  readonly #database: JournalDatabase;
  readonly #onStop: (fault: Failure) => Result<void>;
  #fault: Failure | undefined;

  // `onStop` keeps the worker stopped past this process; its failure is
  // added to the fault, which the worker's service status reports.
  constructor(database: JournalDatabase, onStop: (fault: Failure) => Result<void>) {
    this.#database = database;
    this.#onStop = onStop;
  }

  get fault(): Failure | undefined {
    return this.#fault;
  }

  // A failed `write` rolls the transaction back; success means committed.
  transact<T>(write: (database: JournalDatabase) => Result<T>): Result<T> {
    if (this.#fault !== undefined) return err(this.#stoppedFailure());
    try {
      this.#database.exec('BEGIN IMMEDIATE');
      const written = write(this.#database);
      this.#database.exec(written.ok ? 'COMMIT' : 'ROLLBACK');
      return written;
    } catch (error) {
      return err(this.#onError(error));
    }
  }

  read<T>(query: (database: JournalDatabase) => T): Result<T> {
    if (this.#fault !== undefined) return err(this.#stoppedFailure());
    try {
      return ok(query(this.#database));
    } catch (error) {
      return err(this.#onError(error));
    }
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  #onError(error: unknown): Failure {
    const code = sqliteCode(error);
    const message = (error as Error).message;
    if (code !== undefined && DEVICE_FAULTS.has(code)) return this.#stop(rootFailure('flush-failure', `journal I/O error: ${message}`));
    if (code === SQLITE_CORRUPT || code === SQLITE_NOTADB) return this.#stop(rootFailure('corrupt', `journal corrupt: ${message}`));
    this.#rollback();
    if (code === SQLITE_FULL) return rootFailure('disk-full', `journal write refused for lack of space: ${message}`);
    return failure('internal', `journal error: ${message}`);
  }

  // The device state is unknown, so nothing reads the journal again until a
  // host restart or a new incarnation (contract section 7).
  #stop(fault: Failure): Failure {
    this.#fault = fault;
    this.close();
    const recorded = this.#onStop(fault);
    if (!recorded.ok) this.#fault = { ...fault, details: { ...fault.details, recording: recorded.error.message } };
    return this.#fault;
  }

  #rollback(): void {
    try {
      this.#database.exec('ROLLBACK');
    } catch {
      // No transaction was open.
    }
  }

  #stoppedFailure(): Failure {
    return rootFailure('stopped', `the journal stopped: ${this.#fault?.message ?? ''}`);
  }
}
