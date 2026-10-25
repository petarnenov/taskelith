export { resolveDataRoot, type DataRootSources } from './data-root.js';
export { checkControlPath, refuseCheckout } from './control-records.js';
export { createOnce, createPrivateDirectory, replaceFile, syncBeforeUse, syncPath } from './durable-file.js';
export { ExclusiveFileLock, LOCK_APPLICATION_ID } from './exclusive-file-lock.js';
export { JOURNAL_APPLICATION_ID, JOURNAL_FORMAT } from './journal-database.js';
export { checkJournalFault, hostBootId, recordJournalFault } from './journal-fault.js';
export { ROOT_FAILURE_REASONS, failureReason, type RootFailureReason } from './journal-failure.js';
export type { JournalDatabase } from './journal-connection.js';
export { observationIdOf } from './observation-identity.js';
export {
  REPUBLICATION_BOUND_MS,
  SqliteWorkerJournal,
  WRITE_POINTS,
  type CommitPointHook,
  type JournalClock,
  type JournalHooks,
  type WritePoint,
} from './sqlite-worker-journal.js';
export { checkVolume, parseDfMountPoint, parseMacMountOptions, probeVolume, type VolumeDescription, type VolumeProbe } from './volume.js';
export { IDENTITY_FORMAT, readIdentity, type WorkerIdentity } from './worker-identity.js';
export { enrollWorkerRoot, openWorkerRoot, startNewIncarnation, type WorkerRoot, type WorkerRootOptions } from './worker-root.js';
export { JOURNAL_FILE, workerPaths, type WorkerPaths } from './worker-paths.js';
