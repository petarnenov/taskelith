import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import type { JournalId, RecoveryEpoch } from '@taskelith/execution';
import {
  checkControlPath,
  createOnce,
  createPrivateDirectory,
  refuseCheckout,
  removeTemporaries,
  replaceFile,
  syncPath,
} from '@taskelith/data-root';
import { ExclusiveFileLock } from './exclusive-file-lock.js';
import { createJournalDatabase, openJournalDatabase } from './journal-database.js';
import { rootFailure } from './journal-failure.js';
import { checkJournalFault, clearJournalFault, hostBootId, recordJournalFault } from './journal-fault.js';
import { SqliteWorkerJournal, type CommitPointHook, type JournalClock } from './sqlite-worker-journal.js';
import { checkVolume, probeVolume, type VolumeProbe } from './volume.js';
import { writeCredentials, type WorkerEnrollment } from './worker-credentials.js';
import { readIdentity, serializeIdentity, type WorkerIdentity } from './worker-identity.js';
import { ownerUid, workerPaths, type WorkerPaths } from './worker-paths.js';

export interface WorkerRootOptions {
  readonly dataRoot: string;
  readonly clock: JournalClock;
  readonly probe?: VolumeProbe;
  readonly onCommitPoint?: CommitPointHook;
  // Called after each journal write refused for lack of space.
  readonly onSpaceRefused?: () => void;
}

// An open worker root: the root lock is held until `close`.
export interface WorkerRoot {
  readonly paths: WorkerPaths;
  readonly identity: WorkerIdentity;
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

// A root that enrollment has claimed: `worker/` exists, holds nothing but
// the root lock, and is held until `complete` or `abandon`.
export interface RootClaim {
  readonly paths: WorkerPaths;
  complete(enrollment: WorkerEnrollment): Result<WorkerRoot>;
  abandon(): void;
}

// Every local check of enrollment, before the control plane is asked, so a
// root that cannot be created never spends a token (item 20).
export function claimWorkerRoot(options: WorkerRootOptions): Result<RootClaim> {
  const paths = workerPaths(options.dataRoot);
  if (existsSync(paths.worker)) {
    return err(failure('conflict', `${paths.worker} already exists; without an identity, an operator removes it to enroll again`));
  }
  const prepared = prepareDataRoot(paths, options);
  if (!prepared.ok) {
    // A concurrent claim's `worker/` is a conflict and stays.
    if (prepared.error.code !== 'conflict' && existsSync(paths.worker)) removeSubtree(paths);
    return prepared;
  }
  const safe = checkControlPath(paths.dataRoot, paths.lock, ownerUid());
  const lock = safe.ok ? ExclusiveFileLock.acquire(paths.lock) : safe;
  if (!lock.ok) {
    removeSubtree(paths);
    return lock;
  }
  return ok(rootClaim(paths, options, lock.value));
}

// Enrollment's part (items 13, 20): the journal, then the credentials, then
// the identity, so an identity without a journal means a loss (section 2).
export function enrollWorkerRoot(options: WorkerRootOptions, enrollment: WorkerEnrollment): Result<WorkerRoot> {
  const claim = claimWorkerRoot(options);
  return claim.ok ? claim.value.complete(enrollment) : claim;
}

// A failed or abandoned enrollment leaves no partial subtree that blocks a
// retry; the claim is settled once.
function rootClaim(paths: WorkerPaths, options: WorkerRootOptions, lock: ExclusiveFileLock): RootClaim {
  let settled = false;
  const abandon = () => {
    if (settled) return;
    settled = true;
    lock.release();
    removeSubtree(paths);
  };
  const complete = (enrollment: WorkerEnrollment): Result<WorkerRoot> => {
    if (settled) return err(failure('conflict', `the claim of ${paths.worker} is settled`));
    let enrolled: Result<WorkerRoot> | undefined;
    try {
      enrolled = checkRecordsThen(paths, () => createJournalThenIdentity(paths, options, enrollment, lock));
      return enrolled;
    } finally {
      // A thrown error abandons the claim too.
      if (enrolled?.ok) settled = true;
      else abandon();
    }
  };
  return Object.freeze({ paths, complete, abandon });
}

function removeSubtree(paths: WorkerPaths): void {
  rmSync(paths.worker, { recursive: true, force: true });
}

function createJournalThenIdentity(
  paths: WorkerPaths,
  options: WorkerRootOptions,
  enrollment: WorkerEnrollment,
  lock: ExclusiveFileLock,
): Result<WorkerRoot> {
  for (const directory of [paths.journalDirectory, paths.executions, paths.logs, paths.workspaces]) {
    const created = createPrivateDirectory(directory);
    if (!created.ok) return created;
  }
  const created = createJournalDatabase(paths.journal, enrollment, options.clock.now());
  if (!created.ok) return created;
  created.value.close();
  const credentials = writeCredentials(paths, enrollment);
  if (!credentials.ok) return credentials;
  const { installationId, workerId, journalId, credentialGeneration } = enrollment;
  const identity: WorkerIdentity = { installationId, workerId, journalId, credentialGeneration, credentials: credentials.value };
  const written = createOnce(paths.identity, serializeIdentity(identity));
  if (!written.ok) return written;
  return openJournal(paths, options, identity, lock);
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
    const renewed = { ...identity.value, journalId };
    const created = createJournalDatabase(paths.journal, { ...renewed, recoveryEpoch }, options.clock.now());
    if (!created.ok) return created;
    created.value.close();
    const replaced = replaceFile(paths.identity, serializeIdentity(renewed));
    if (!replaced.ok) return replaced;
    return openJournal(paths, options, renewed, lock);
  });
}

function prepareDataRoot(paths: WorkerPaths, options: WorkerRootOptions): Result<void> {
  const outside = refuseCheckout(paths.dataRoot);
  if (!outside.ok) return outside;
  const volume = checkVolume(nearestExisting(paths.dataRoot), options.probe ?? probeVolume);
  if (!volume.ok) return volume;
  if (!existsSync(paths.dataRoot)) {
    mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
    const synced = syncPath(dirname(paths.dataRoot));
    if (!synced.ok) return synced;
  }
  return createPrivateDirectory(paths.worker);
}

function nearestExisting(path: string): string {
  return existsSync(path) || dirname(path) === path ? path : nearestExisting(dirname(path));
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
  const records = [paths.identity, paths.credentials, paths.fault, paths.journal, `${paths.journal}-wal`, paths.executions, paths.logs];
  for (const record of records) {
    const safe = checkControlPath(paths.dataRoot, record, uid);
    if (!safe.ok) return safe;
  }
  for (const directory of [paths.worker, paths.credentials, paths.journalDirectory]) if (existsSync(directory)) removeTemporaries(directory);
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
    ...(options.onSpaceRefused === undefined ? {} : { onSpaceRefused: options.onSpaceRefused }),
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
    identity,
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
