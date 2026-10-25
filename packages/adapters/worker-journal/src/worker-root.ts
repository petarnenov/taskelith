import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import type { JournalBinding, JournalId, RecoveryEpoch } from '@taskelith/execution';
import { checkControlPath, refuseCheckout } from './control-records.js';
import { createOnce, createPrivateDirectory, removeTemporaries, replaceFile, syncPath } from './durable-file.js';
import { ExclusiveFileLock } from './exclusive-file-lock.js';
import { createJournalDatabase, openJournalDatabase } from './journal-database.js';
import { rootFailure } from './journal-failure.js';
import { checkJournalFault, clearJournalFault, hostBootId, recordJournalFault } from './journal-fault.js';
import { SqliteWorkerJournal, type CommitPointHook, type JournalClock } from './sqlite-worker-journal.js';
import { checkVolume, probeVolume, type VolumeProbe } from './volume.js';
import { readIdentity, serializeIdentity, type WorkerIdentity } from './worker-identity.js';
import { workerPaths, type WorkerPaths } from './worker-paths.js';

export interface WorkerRootOptions {
  readonly dataRoot: string;
  readonly clock: JournalClock;
  readonly probe?: VolumeProbe;
  readonly onCommitPoint?: CommitPointHook;
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
  const enrolled = enrolledPaths(options);
  if (!enrolled.ok) return enrolled;
  const paths = enrolled.value;
  return withRootLock(paths, (lock) => {
    const identity = readIdentity(paths.identity);
    if (!identity.ok) return identity;
    const bootId = hostBootId();
    if (!bootId.ok) return bootId;
    const fault = checkJournalFault(paths.fault, bootId.value);
    if (!fault.ok) return fault;
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
  let enrolled: Result<WorkerRoot> | undefined;
  try {
    enrolled = withRootLock(paths, (lock) => createJournalThenIdentity(paths, options, binding, lock));
    return enrolled;
  } finally {
    // A failed enrollment leaves no partial subtree that blocks a retry.
    if (!enrolled?.ok) rmSync(paths.worker, { recursive: true, force: true });
  }
}

function createJournalThenIdentity(
  paths: WorkerPaths,
  options: WorkerRootOptions,
  binding: JournalBinding,
  lock: ExclusiveFileLock,
): Result<WorkerRoot> {
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
}

// The operator's explicit recovery from a journal loss or corruption: the
// old files move aside as evidence, and the identity names a new journal.
export function startNewIncarnation(
  options: WorkerRootOptions,
  journalId: JournalId,
  recoveryEpoch: RecoveryEpoch,
): Result<WorkerRoot> {
  const enrolled = enrolledPaths(options);
  if (!enrolled.ok) return enrolled;
  const paths = enrolled.value;
  return withRootLock(paths, (lock) => {
    const identity = readIdentity(paths.identity);
    if (!identity.ok) return identity;
    const moved = moveJournalAside(paths, identity.value.journalId, options.clock);
    if (!moved.ok) return moved;
    const cleared = clearJournalFault(paths.fault);
    if (!cleared.ok) return cleared;
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
  return volume.ok ? createPrivateDirectory(paths.worker) : volume;
}

// The paths of an enrolled root that lies outside any checkout, on a volume
// that can hold the journal.
function enrolledPaths(options: WorkerRootOptions): Result<WorkerPaths> {
  const paths = workerPaths(options.dataRoot);
  if (!existsSync(paths.worker)) return err(rootFailure('not-enrolled', `${paths.worker} does not exist`));
  const outside = refuseCheckout(paths.worker);
  if (!outside.ok) return outside;
  const volume = checkVolume(paths.worker, options.probe ?? probeVolume);
  return volume.ok ? ok(paths) : volume;
}

function ownerUid(): number {
  return process.getuid?.() ?? -1;
}

// Takes the root lock, checks the control records, then runs `use`; the
// lock is released again when `use` fails.
function withRootLock(paths: WorkerPaths, use: (lock: ExclusiveFileLock) => Result<WorkerRoot>): Result<WorkerRoot> {
  const safe = checkControlPath(paths.dataRoot, paths.lock, ownerUid());
  if (!safe.ok) return safe;
  const lock = ExclusiveFileLock.acquire(paths.lock);
  if (!lock.ok) return lock;
  let opened: Result<WorkerRoot> | undefined;
  try {
    opened = checkRecordsThen(paths, () => use(lock.value));
    return opened;
  } finally {
    if (!opened?.ok) lock.value.release();
  }
}

function checkRecordsThen(paths: WorkerPaths, use: () => Result<WorkerRoot>): Result<WorkerRoot> {
  const uid = ownerUid();
  for (const record of [paths.identity, paths.fault, paths.journal, `${paths.journal}-wal`, paths.executions, paths.logs]) {
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
  const journal = SqliteWorkerJournal.open(database.value, options.clock, {
    ...(options.onCommitPoint === undefined ? {} : { onCommitPoint: options.onCommitPoint }),
    onStop: (fault) => keepStopped(paths, fault),
  });
  if (!journal.ok) {
    if (database.value.isOpen) database.value.close();
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

function keepStopped(paths: WorkerPaths, fault: Failure): Result<void> {
  const bootId = hostBootId();
  return bootId.ok ? recordJournalFault(paths.fault, fault, bootId.value) : bootId;
}

function moveJournalAside(paths: WorkerPaths, oldJournalId: JournalId, clock: JournalClock): Result<void> {
  const suffix = `${clock.now().replaceAll(':', '-')}-${randomBytes(4).toString('hex')}`;
  const evidence = join(paths.journalDirectory, `evidence-${oldJournalId}-${suffix}`);
  const created = createPrivateDirectory(evidence);
  if (!created.ok) return created;
  for (const fileSuffix of ['', '-wal', '-shm']) {
    const file = `${paths.journal}${fileSuffix}`;
    if (existsSync(file)) renameSync(file, join(evidence, `journal.sqlite${fileSuffix}`));
  }
  const synced = syncPath(evidence);
  return synced.ok ? syncPath(paths.journalDirectory) : synced;
}
