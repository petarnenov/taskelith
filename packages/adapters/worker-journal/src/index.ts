export {
  checkControlPath,
  createOnce,
  createPrivateDirectory,
  refuseCheckout,
  replaceFile,
  resolveDataRoot,
  syncBeforeUse,
  syncPath,
  type DataRootSources,
} from '@taskelith/data-root';
export { truncateBufferedLogs } from './buffered-logs.js';
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
export {
  checkVolume,
  parseDfMountPoint,
  parseMacMountOptions,
  probeVolume,
  readVolumeSpace,
  type VolumeDescription,
  type VolumeProbe,
  type VolumeSpace,
  type VolumeSpaceReader,
} from './volume.js';
export {
  credentialReferencesOf,
  readWorkerCredentials,
  type WorkerCredentials,
  type WorkerEnrollment,
} from './worker-credentials.js';
export { IDENTITY_FORMAT, readIdentity, type CredentialReferences, type WorkerIdentity } from './worker-identity.js';
export {
  claimWorkerRoot,
  enrollWorkerRoot,
  openWorkerRoot,
  startNewIncarnation,
  type RootClaim,
  type WorkerRoot,
  type WorkerRootOptions,
} from './worker-root.js';
export { JOURNAL_FILE, workerPaths, type WorkerPaths } from './worker-paths.js';
