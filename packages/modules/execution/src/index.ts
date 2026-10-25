export {
  ATTEMPT_PHASES,
  ATTEMPT_PHASE_TRANSITIONS,
  CANCELLATION_REASONS,
  attemptPhase,
  owningExecution,
  type Attempt,
  type AttemptOutcome,
  type AttemptPhase,
  type CancellationReason,
  type OutcomeValues,
  type CancellationRequest,
} from './domain/attempt.js';
export {
  EXECUTION_EVIDENCE_KINDS,
  EXECUTION_STATES,
  EXECUTION_TRANSITIONS,
  START_KINDS,
  isTerminalExecution,
  isUnknownExecution,
  parseExitStatus,
  type Execution,
  type ExecutionEvidence,
  type ExecutionEvidenceKind,
  type ExecutionState,
  type ExitFact,
  type ExitStatus,
  type ExitStatusInput,
  type StartFact,
  type StartKind,
  type UnauthorizedStart,
} from './domain/execution.js';
export {
  parseRecoveryEpoch,
  type AssignmentId,
  type AttemptId,
  type ExecutionId,
  type InstallationState,
  type LaunchAuthId,
  type OperationId,
  type RecoveryEpoch,
  type WorkerId,
} from './domain/identifiers.js';
export {
  AUTHORIZATION_OUTCOMES,
  type AuthorizationOutcome,
  type CancellationTarget,
  type CommandId,
  type CommandRecording,
  type InstallationId,
  type JournalBinding,
  type JournaledAuthorization,
  type JournaledCancellation,
  type JournaledCommand,
  type JournaledExecution,
  type JournalSnapshot,
  type LaunchIntent,
  type ObservationFact,
  type OutboxEntry,
} from './domain/journal-records.js';
export { planJournalRecovery, type RecoveryAction } from './domain/journal-recovery.js';
export {
  authorizeLaunch,
  rejectUnknownAssignment,
  replayLaunchOperation,
  type GrantIssue,
  type LaunchAssignment,
  type LaunchAuthorization,
  type LaunchContext,
  type LaunchRequest,
  type LaunchReservation,
  type LaunchOutcome,
  type ReplayOutcome,
} from './domain/launch-authorization.js';
export {
  GRANT_STATES,
  isGrantExpired,
  workerLaunchDeadline,
  parseLaunchParameters,
  type GrantState,
  type LaunchGrant,
  type LaunchGrantValues,
  type LaunchParameters,
  type LaunchParametersInput,
} from './domain/launch-grant.js';
export {
  LAUNCH_REJECTION_REASONS,
  RETRYABLE_LAUNCH_REJECTIONS,
  REVOCATION_REASONS,
  launchRejection,
  type LaunchRejection,
  type LaunchRejectionReason,
  type RevocationReason,
} from './domain/launch-rejection.js';
export {
  SEQUENCE_CLASSES,
  classifyObservation,
  parseSequence,
  recordAppliedSequence,
  startProducerCursor,
  type JournalId,
  type ObservationId,
  type ObservationPosition,
  type ProducerCursor,
  type Sequence,
  type SequenceClass,
} from './domain/observation-sequence.js';
export {
  START_DECISIONS,
  decideStartObservation,
  recordStartObservation,
  type StartContext,
  type StartDecision,
  type StartObservation,
  type StartRecord,
} from './domain/start-observation.js';
export {
  activeAttempt,
  checkOwnership,
  canResendAssignment,
  claimOwnership,
  endAttempt,
  executionsUnderAssignment,
  isLaunchAffected,
  openAttempt,
  openTask,
  rebindAdmission,
  recordExecutionEvidence,
  recordExit,
  recordNotStarted,
  requestCancellation,
  resolveByOperator,
  revokeLaunch,
  taskOutcomeFact,
  unknownExecutionCount,
  type AssignmentExecutions,
  type AttemptRequest,
  type EvidenceReport,
  type ExecutionReport,
  type ExitReport,
  type ObservationResult,
  type Task,
  type TaskOutcomeFact,
} from './domain/task.js';
export { InMemoryInbox } from './adapters/in-memory-inbox.js';
export { InMemoryTaskRepository } from './adapters/in-memory-task-repository.js';
export type { Inbox, InboxOutcome } from './ports/inbox.js';
export type { LaunchAuthorityClient, LaunchAuthorizationRequest } from './ports/launch-authority-client.js';
export type { LaunchPredicate, LaunchRecords, RecordedLaunch, RecordedRejection } from './ports/launch-records.js';
export type { Outbox, OutboxMessage } from './ports/outbox.js';
// The outbox ports are structurally identical, so they share one suite.
export { OUTBOX_CONFORMANCE } from '@taskelith/sdlc';
export {
  INBOX_CONFORMANCE,
  LAUNCH_RECORDS_CONFORMANCE,
  TASK_REPOSITORY_CONFORMANCE,
  type LaunchRecordsConformanceTarget,
} from './ports/repository-conformance.js';
export type { TaskRepository } from './ports/task-repository.js';
export type { WorkerJournal } from './ports/worker-journal.js';
