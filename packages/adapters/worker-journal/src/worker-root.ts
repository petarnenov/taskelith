import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { JournalBinding, JournalId, RecoveryEpoch } from '@taskelith/execution';
import { checkControlPath, refuseCheckout } from './control-records.js';
import { createOnce, createPrivateDirectory, removeTemporaries, replaceFile, syncPath } from './durable-file.js';
import { ExclusiveFileLock } from './exclusive-file-lock.js';
import { createJournalDatabase, openJournalDatabase } from './journal-database.js';
import { rootFailure } from './journal-failure.js';
import { SqliteWorkerJournal, type JournalClock } from './sqlite-worker-journal.js';
import { checkVolume, probeVolume, type VolumeProbe } from './volume.js';
import { readIdentity, serializeIdentity, type WorkerIdentity } from './worker-identity.js';
import { workerPaths, type WorkerPaths } from './worker-paths.js';

export interface WorkerRootOptions {
  readonly dataRoot: string;
  readonly clock: JournalClock;
  readonly probe?: VolumeProbe;
}

// An open worker root: the root lock is held until `close`.
export interface WorkerRoot {
  readonly paths: WorkerPaths;
  readonly journal: SqliteWorkerJournal;
  close(): void;
}

// The start of a worker: checks the subtree, takes the root lock, and runs
// the start checks of contract section 8 before anything else.
export function openWorkerRoot(options: WorkerRootOptions): Result<WorkerRoot> {
  const paths = workerPaths(options.dataRoot);
  if (!existsSync(paths.worker)) return err(rootFailure('not-enrolled', `${paths.worker} does not exist`));
  return withRootLock(paths, options, (lock) => {
    const identity = readIdentity(paths.identity);
    if (!identity.ok) return identity;
    return openJournal(paths, options, identity.value, lock);
  });
}

// Enrollment's part (item 13): the journal first, the identity last, so an
// identity without a journal always means a loss (contract section 2).
export function enrollWorkerRoot(options: WorkerRootOptions, binding: JournalBinding): Result<WorkerRoot> {
  const paths = workerPaths(options.dataRoot);
  if (existsSync(paths.worker)) return err(failure('conflict', `${paths.worker} already exists`));
  const prepared = prepareDataRoot(paths, options);
  if (!prepared.ok) return prepared;
  return withRootLock(paths, options, (lock) => {
    for (const directory of [paths.journalDirectory, paths.executions, paths.logs, paths.workspaces]) {
      const created = createPrivateDirectory(directory);
      if (!created.ok) return created;
    }
    const created = createJournalDatabase(paths.journal, binding, options.clock.now());
    if (!created.ok) return created;
    created.value.close();
    const identity = createOnce(paths.identity, serializeIdentity(binding));
    if (!identity.ok) return identity;
    return openJournal(paths, options, binding, lock);
  });
}

// The operator's explicit recovery from a journal loss or corruption: the
// old files move aside as evidence, and the identity names a new journal.
export function startNewIncarnation(
  options: WorkerRootOptions,
  journalId: JournalId,
  recoveryEpoch: RecoveryEpoch,
): Result<WorkerRoot> {
  const paths = workerPaths(options.dataRoot);
  if (!existsSync(paths.worker)) return err(rootFailure('not-enrolled', `${paths.worker} does not exist`));
  return withRootLock(paths, options, (lock) => {
    const identity = readIdentity(paths.identity);
    if (!identity.ok) return identity;
    const moved = moveJournalAside(paths, identity.value.journalId);
    if (!moved.ok) return moved;
    const binding = { ...identity.value, journalId, recoveryEpoch };
    const created = createJournalDatabase(paths.journal, binding, options.clock.now());
    if (!created.ok) return created;
    created.value.close();
    const replaced = replaceFile(paths.identity, serializeIdentity(binding));
    if (!replaced.ok) return replaced;
    return openJournal(paths, options, binding, lock);
  });
}

function prepareDataRoot(paths: WorkerPaths, options: WorkerRootOptions): Result<void> {
  const outside = refuseCheckout(paths.dataRoot);
  if (!outside.ok) return outside;
  if (!existsSync(paths.dataRoot)) {
    mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
    const synced = syncPath(dirname(paths.dataRoot));
    if (!synced.ok) return synced;
  }
  const volume = checkVolume(paths.dataRoot, options.probe ?? probeVolume);
  if (!volume.ok) return volume;
  return createPrivateDirectory(paths.worker);
}

// Every check that precedes the lock, then the lock, then `use`; the lock
// is released again when `use` fails.
function withRootLock(
  paths: WorkerPaths,
  options: WorkerRootOptions,
  use: (lock: ExclusiveFileLock) => Result<WorkerRoot>,
): Result<WorkerRoot> {
  const outside = refuseCheckout(paths.dataRoot);
  if (!outside.ok) return outside;
  const safe = checkControlPath(paths.dataRoot, paths.lock, process.getuid?.() ?? -1);
  if (!safe.ok) return safe;
  const volume = checkVolume(paths.worker, options.probe ?? probeVolume);
  if (!volume.ok) return volume;
  const lock = ExclusiveFileLock.acquire(paths.lock);
  if (!lock.ok) return lock;
  const opened = checkRecordsThen(paths, () => use(lock.value));
  if (!opened.ok) lock.value.release();
  return opened;
}

function checkRecordsThen(paths: WorkerPaths, use: () => Result<WorkerRoot>): Result<WorkerRoot> {
  const uid = process.getuid?.() ?? -1;
  for (const record of [paths.identity, paths.journal, `${paths.journal}-wal`, paths.executions, paths.logs]) {
    const safe = checkControlPath(paths.dataRoot, record, uid);
    if (!safe.ok) return safe;
  }
  for (const directory of [paths.worker, paths.journalDirectory]) if (existsSync(directory)) removeTemporaries(directory);
  return use();
}

function openJournal(
  paths: WorkerPaths,
  options: WorkerRootOptions,
  identity: WorkerIdentity,
  lock: ExclusiveFileLock,
): Result<WorkerRoot> {
  const database = openJournalDatabase(paths.journal);
  if (!database.ok) return database;
  const journal = SqliteWorkerJournal.open(database.value, options.clock);
  if (!journal.ok) {
    database.value.close();
    return journal;
  }
  const { binding } = journal.value;
  if (binding.installationId !== identity.installationId || binding.workerId !== identity.workerId
    || binding.journalId !== identity.journalId) {
    journal.value.close();
    return err(rootFailure('binding-mismatch', `the journal ${binding.journalId} is not the one the identity names`));
  }
  return ok(Object.freeze({
    paths,
    journal: journal.value,
    close: () => {
      journal.value.close();
      lock.release();
    },
  }));
}

function moveJournalAside(paths: WorkerPaths, oldJournalId: JournalId): Result<void> {
  const evidence = join(paths.journalDirectory, `evidence-${oldJournalId}-${Date.now()}`);
  const created = createPrivateDirectory(evidence);
  if (!created.ok) return created;
  for (const suffix of ['', '-wal']) {
    const file = `${paths.journal}${suffix}`;
    if (existsSync(file)) renameSync(file, join(evidence, `journal.sqlite${suffix}`));
  }
  const synced = syncPath(evidence);
  return synced.ok ? syncPath(paths.journalDirectory) : synced;
}
