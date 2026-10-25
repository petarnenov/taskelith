export { darwinPlatform, DarwinDeadlineClock, DarwinProcessInspector } from './darwin.js';
export { encodeEvent, parseEvents } from './event-log.js';
export { SqliteExecutionLock } from './execution-lock.js';
export { FileRecordStore } from './file-record-store.js';
export {
  LinuxContainment,
  LinuxDeadlineClock,
  linuxPlatform,
  LinuxProcessInspector,
  parseCgroup,
  parseProcStat,
  parseUptime,
  type LinuxPlatformOptions,
  type ProcStat,
} from './linux.js';
export { checkLinuxContainment, type LinuxSelfCheckOptions } from './linux-self-check.js';
export { NodeSpawner } from './node-spawner.js';
export type {
  ChildExit,
  Containment,
  CreateOutcome,
  DeadlineClock,
  DeadlineReading,
  ExecutionLock,
  HeldLock,
  Platform,
  ProcessInspector,
  RecordStore,
  Spawner,
  SpawnResult,
} from './ports.js';
export { sameProcess, type ProcessEntry, type ProcessIdentity } from './process-identity.js';
export {
  encodeRecord,
  parseCancel,
  parseEventEntry,
  parseExit,
  parseHandle,
  parseIntent,
  parseLaunch,
  parseSupervisor,
  READABLE_RECORD_FORMATS,
  RECORD_FILES,
  RECORD_FORMAT,
  SEAL_REASONS,
  supervisorFile,
  TERMINATION_EVIDENCE,
  type CancelRecord,
  type Command,
  type EventEntry,
  type ExecutionAccount,
  type ExitRecord,
  type HandleRecord,
  type IntentRecord,
  type LaunchRecord,
  type RecordProblem,
  type SealReason,
  type SupervisorRecord,
  type TerminationEvidence,
} from './record.js';
export {
  decideRecovery,
  type NativeEvidence,
  type RecordSnapshot,
  type RecoveryDecision,
  type RecoveryEvidence,
  type SupervisorLiveness,
} from './recovery.js';
export { supervisorMain } from './supervisor-main.js';
export {
  hostPlatform,
  parseProgramArguments,
  runSupervisorProgram,
  startDetachedProcess,
  startDetachedSupervisor,
  SUPERVISOR_MAIN,
  SUPERVISOR_TIMING,
  supervisorCommand,
  type ProgramArguments,
  type ProgramOptions,
} from './supervisor-program.js';
export { adoptExecution } from './adoption.js';
export { superviseLaunch } from './supervisor.js';
export {
  highestSupervisor,
  type SupervisorDependencies,
  type SupervisorOutcome,
  type SupervisorTiming,
} from './supervisor-session.js';
export { proveDarwinTermination, type DarwinTerminationInput, type TerminationProof } from './termination.js';
export {
  gatherEvidence,
  prepareRecord,
  readReportedFacts,
  recoverExecution,
  removeRecord,
  requestCancellation,
  sealLaunch,
  startSupervisor,
  type RecoveryResult,
  type ReportedFacts,
  type SupervisorMode,
  type WorkerSupervisionDependencies,
} from './worker-supervision.js';
