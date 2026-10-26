import { chmodSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { err, failure, ok, type Err, type Failure, type Instant, type Result } from '@taskelith/kernel';
import type { JournalBinding } from '@taskelith/execution';
import { syncPath } from '@taskelith/data-root';
import { rootFailure } from './journal-failure.js';
import { JOURNAL_SCHEMA, MIGRATION_FROM_FORMAT_1, MIGRATION_FROM_FORMAT_2 } from './journal-schema.js';
import { isSqliteError, SQLITE_BUSY, SQLITE_CORRUPT, SQLITE_NOTADB } from './sqlite-errors.js';

// Marks a database as a Taskelith worker journal: "TKJL".
export const JOURNAL_APPLICATION_ID = 0x544b4a4c;
export const JOURNAL_FORMAT = 3;
const OLDEST_FORMAT = 1;
// The step from each older format to the next one.
const MIGRATIONS: Readonly<Record<number, string>> = Object.freeze({ 1: MIGRATION_FROM_FORMAT_1, 2: MIGRATION_FROM_FORMAT_2 });

// Section 3 of the worker journal contract: exclusive locking first, then
// these, in order; the header is checked before WAL mode changes the file.
const SETTINGS: readonly (readonly [pragma: string, value: string, expected: number | string])[] = Object.freeze([
  ['locking_mode', 'EXCLUSIVE', 'exclusive'],
  ['journal_mode', 'WAL', 'wal'],
  ['synchronous', 'FULL', 2],
  ['fullfsync', 'ON', 1],
  ['checkpoint_fullfsync', 'ON', 1],
  ['foreign_keys', 'ON', 1],
  ['wal_autocheckpoint', '1000', 1000],
  ['journal_size_limit', String(64 * 1024 * 1024), 64 * 1024 * 1024],
]);

// Creates a journal; enrollment and a new incarnation call it before the
// identity names the journal (contract sections 2 and 8).
export function createJournalDatabase(path: string, binding: JournalBinding, createdAt: Instant): Result<DatabaseSync> {
  if (existsSync(path)) return err(failure('conflict', `a journal already exists at ${path}`, { path }));
  return guard(path, (database) => {
    chmodSync(path, 0o600);
    database.exec('PRAGMA locking_mode = EXCLUSIVE');
    const configured = configure(database, path);
    if (!configured.ok) return closeWith(database, configured);
    database.exec('BEGIN IMMEDIATE');
    database.exec(`PRAGMA application_id = ${JOURNAL_APPLICATION_ID}`);
    database.exec(`PRAGMA user_version = ${JOURNAL_FORMAT}`);
    database.exec(JOURNAL_SCHEMA);
    database.prepare(`INSERT INTO journal_meta
      (singleton, journal_id, installation_id, worker_id, recovery_epoch, next_sequence, created_at)
      VALUES (1, ?, ?, ?, ?, 1, ?)`)
      .run(binding.journalId, binding.installationId, binding.workerId, binding.recoveryEpoch, createdAt);
    database.exec('COMMIT');
    const synced = syncPath(dirname(path));
    return synced.ok ? ok(database) : closeWith(database, synced);
  });
}

// Opens an existing journal and runs the start checks of section 8; the
// caller compares the stored binding with the worker identity.
export function openJournalDatabase(path: string): Result<DatabaseSync> {
  if (!existsSync(path)) return err(rootFailure('journal-loss', `the journal ${path} is missing`, { path }));
  if (existsSync(`${path}-shm`)) return err(sharedMemoryFailure(path));
  return guard(path, (database) => {
    database.exec('PRAGMA locking_mode = EXCLUSIVE');
    const header = verifyHeader(database);
    if (!header.ok) return closeWith(database, header);
    const checked = configure(database, path);
    if (!checked.ok) return closeWith(database, checked);
    const intact = quickCheck(database);
    if (!intact.ok) return closeWith(database, intact);
    migrate(database);
    return ok(database);
  });
}

// One transaction, so a crash leaves either format complete (section 10).
function migrate(database: DatabaseSync): void {
  const format = Number(database.prepare('PRAGMA user_version').get()?.user_version);
  if (format === JOURNAL_FORMAT) return;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (let step = format; step < JOURNAL_FORMAT; step += 1) database.exec(MIGRATIONS[step] ?? '');
    database.exec(`PRAGMA user_version = ${JOURNAL_FORMAT}`);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function configure(database: DatabaseSync, path: string): Result<void> {
  for (const [pragma, value] of SETTINGS) database.exec(`PRAGMA ${pragma} = ${value}`);
  for (const [pragma, , expected] of SETTINGS) {
    const actual = database.prepare(`PRAGMA ${pragma}`).get()?.[pragma];
    if (actual !== expected) {
      return err(failure('internal', `PRAGMA ${pragma} is ${String(actual)}, expected ${String(expected)}`, { pragma }));
    }
  }
  if (existsSync(`${path}-shm`)) return err(sharedMemoryFailure(path));
  return ok(undefined);
}

// Reads only the header, so a foreign file stays untouched (section 8).
function verifyHeader(database: DatabaseSync): Result<void> {
  const applicationId = Number(database.prepare('PRAGMA application_id').get()?.application_id);
  if (applicationId !== JOURNAL_APPLICATION_ID) return err(rootFailure('corrupt', 'the file is not a Taskelith worker journal'));
  const format = Number(database.prepare('PRAGMA user_version').get()?.user_version);
  if (format > JOURNAL_FORMAT) {
    return err(rootFailure('newer-format', `journal format ${format} is newer than ${JOURNAL_FORMAT}`, { format: String(format) }));
  }
  if (format < OLDEST_FORMAT) return err(rootFailure('corrupt', `journal format ${format} is unknown`));
  return ok(undefined);
}

function quickCheck(database: DatabaseSync): Result<void> {
  const check = database.prepare('PRAGMA quick_check').all().map((row) => row.quick_check);
  if (check.length !== 1 || check[0] !== 'ok') return err(rootFailure('corrupt', `quick_check failed: ${check.join('; ')}`));
  return ok(undefined);
}

// Another connection opened the journal without exclusive locking, for
// example an inspection tool while the worker was stopped.
function sharedMemoryFailure(path: string): Failure {
  const remedy = 'remove it while the worker is stopped';
  return rootFailure('foreign-access', `${path}-shm exists, so another process opened the journal; ${remedy}`, { path });
}

// Opens the file for `use`, which closes it on a failed result; a thrown
// error closes it here and is classified.
function guard(path: string, use: (database: DatabaseSync) => Result<DatabaseSync>): Result<DatabaseSync> {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, { timeout: 0 });
    return use(database);
  } catch (error) {
    if (database?.isOpen) database.close();
    if (isSqliteError(error, SQLITE_CORRUPT) || isSqliteError(error, SQLITE_NOTADB)) {
      return err(rootFailure('corrupt', `the journal ${path} is corrupt: ${(error as Error).message}`, { path }));
    }
    if (isSqliteError(error, SQLITE_BUSY)) return err(rootFailure('root-locked', `the journal ${path} is in use`, { path }));
    return err(failure('internal', `cannot open the journal ${path}: ${(error as Error).message}`, { path }));
  }
}

function closeWith(database: DatabaseSync, failed: Err<Failure>): Err<Failure> {
  database.close();
  return failed;
}
