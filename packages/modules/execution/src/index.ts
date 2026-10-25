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
  ASSIGNMENT_REFUSAL_REASONS,
  AUTHORIZATION_OUTCOMES,
  COMMAND_REJECTION_REASONS,
  type AssignmentRef,
  type AssignmentRefusalReason,
  type AuthorizationOutcome,
  type CancellationTarget,
  type CommandCause,
  type CommandId,
  type CommandRecording,
  type CommandRejection,
  type CommandRejectionReason,
  type DeclaredCapacity,
  type InstallationId,
  type JournalBinding,
  type JournaledAuthorization,
  type JournaledCancellation,
  type JournaledCommand,
  type JournaledExecution,
  type JournaledIntent,
  type JournalInventory,
  type JournalSnapshot,
  type LaunchIntent,
  type ObservationFact,
  type OutboxEntry,
  type ProtocolWindow,
  type ResourceRequest,
} from './domain/journal-records.js';
export {
  assembleSnapshot,
  classifyOmission,
  highestAppliedSequence,
  isFreshReport,
  isRolledBack,
  supersededReports,
  type AcceptanceProvenance,
  type InventoryPart,
  type InventoryRequest,
  type InventorySnapshot,
  type JournalBound,
  type OmissionClass,
  type ReportedAssignment,
  type ReportedExecution,
  type ReportFreshness,
  type SnapshotAssembly,
} from './domain/inventory.js';
export { planJournalRecovery, type RecoveryAction } from './domain/journal-recovery.js';
export {
  authorizeLaunch,
  checkLaunchPreconditions,
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
export { InMemoryInventoryReports, InMemoryInventoryRequests } from './adapters/in-memory-inventory.js';
export { InMemoryProducerCursors } from './adapters/in-memory-producer-cursors.js';
export { InMemoryTaskRepository } from './adapters/in-memory-task-repository.js';
export { EVIDENCE_RECORDS_CONFORMANCE, EVIDENCE_STORE_CONFORMANCE } from './ports/evidence-conformance.js';
export type { EvidenceRecords } from './ports/evidence-records.js';
export type { EvidenceStore } from './ports/evidence-store.js';
export type { Inbox, InboxOutcome } from './ports/inbox.js';
export type { LaunchAuthorityClient, LaunchAuthorizationRequest } from './ports/launch-authority-client.js';
export type { LaunchPredicate, LaunchRecords, RecordedLaunch, RecordedRejection } from './ports/launch-records.js';
export type { Outbox, OutboxMessage } from './ports/outbox.js';
export type { InventoryReports } from './ports/inventory-reports.js';
export type { InventoryRequests } from './ports/inventory-requests.js';
export type { ProducerCursors, ProducerJournal } from './ports/producer-cursors.js';
// The outbox ports are structurally identical, so they share one suite.
export { OUTBOX_CONFORMANCE } from '@taskelith/sdlc';
export {
  INBOX_CONFORMANCE,
  INVENTORY_REPORTS_CONFORMANCE,
  INVENTORY_REQUESTS_CONFORMANCE,
  LAUNCH_RECORDS_CONFORMANCE,
  PRODUCER_CURSORS_CONFORMANCE,
  TASK_REPOSITORY_CONFORMANCE,
  type LaunchRecordsConformanceTarget,
} from './ports/repository-conformance.js';
export type { TaskRepository } from './ports/task-repository.js';
export type { WorkerJournal } from './ports/worker-journal.js';
