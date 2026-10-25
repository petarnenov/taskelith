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
  EVIDENCE_RETENTION_DAYS,
  acceptEvidence,
  checkRetentionElapsed,
  isSamePublication,
  parseEvidencePublication,
  retentionEndsAt,
  type EvidenceContext,
  type EvidenceId,
  type EvidenceProducer,
  type EvidencePublication,
  type EvidencePublicationInput,
  type EvidenceRecord,
  type EvidenceValidator,
} from './domain/evidence.js';
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
  replayLaunchOperation,
  type GrantIssue,
  type LaunchAssignment,
  type LaunchAuthorization,
  type LaunchContext,
  type LaunchRequest,
  type LaunchReservation,
  type ReplayOutcome,
} from './domain/launch-authorization.js';
export {
  GRANT_STATES,
  isGrantExpired,
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
  placementNeed,
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
  type PlacementNeed,
  type Task,
  type TaskOutcomeFact,
} from './domain/task.js';
export { InMemoryEvidenceRecords } from './adapters/in-memory-evidence.js';
export { InMemoryInbox } from './adapters/in-memory-inbox.js';
export { InMemoryTaskRepository } from './adapters/in-memory-task-repository.js';
export { EVIDENCE_RECORDS_CONFORMANCE, EVIDENCE_STORE_CONFORMANCE } from './ports/evidence-conformance.js';
export type { EvidenceRecords } from './ports/evidence-records.js';
export type { EvidenceStore } from './ports/evidence-store.js';
export type { Inbox, InboxOutcome } from './ports/inbox.js';
export type { Outbox, OutboxMessage } from './ports/outbox.js';
// The outbox ports are structurally identical, so they share one suite.
export { OUTBOX_CONFORMANCE } from '@taskelith/sdlc';
export { INBOX_CONFORMANCE, TASK_REPOSITORY_CONFORMANCE } from './ports/repository-conformance.js';
export type { TaskRepository } from './ports/task-repository.js';
export type { WorkerJournal } from './ports/worker-journal.js';
