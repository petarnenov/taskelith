import type { CorrelationId, Identifier, Instant } from '@taskelith/kernel';
import type { AdmissionId, Generation, OwnershipGeneration } from '@taskelith/sdlc';
import type { ExecutionState, ExitStatus } from './execution.js';
import type { AssignmentId, AttemptId, ExecutionId, LaunchAuthId, OperationId, RecoveryEpoch, WorkerId } from './identifiers.js';
import type { LaunchRejectionReason } from './launch-rejection.js';
import type { JournalId, ObservationPosition } from './observation-sequence.js';

// The records of the worker journal contract, section 5, as a worker reads
// them back; the journal adapter owns their storage.
export type CommandId = Identifier<'CommandId'>;
export type InstallationId = Identifier<'InstallationId'>;

// What one journal incarnation is bound to (contract section 8).
export interface JournalBinding {
  readonly installationId: InstallationId;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly recoveryEpoch: RecoveryEpoch;
}

// The CPU, memory, and hard controls an offer's reservation holds.
export interface ResourceRequest {
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly hardControls: readonly string[];
}

export interface LaunchIntent {
  readonly assignmentId: AssignmentId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly admissionId: AdmissionId;
  readonly admissionGeneration: Generation;
  // The epoch the offer names, which the worker's launch requests carry.
  readonly recoveryEpoch: RecoveryEpoch;
  readonly requested: ResourceRequest;
}

// An intent as journaled: an ended assignment is never launched or counted
// (capacity reservation contract, section 8).
export interface JournaledIntent extends LaunchIntent {
  readonly commandId: CommandId;
  readonly ended: boolean;
}

// The attempt an assignment command names, at the generation it names.
export interface AssignmentRef {
  readonly assignmentId: AssignmentId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
}

export type CancellationTarget =
  | { readonly kind: 'attempt'; readonly attemptId: AttemptId }
  | { readonly kind: 'execution'; readonly executionId: ExecutionId };

// The reasons of `execution.command.rejected` (wire contracts section 3).
export const COMMAND_REJECTION_REASONS = Object.freeze(['protocol-not-supported', 'addressed-to-another-worker'] as const);

export type CommandRejectionReason = (typeof COMMAND_REJECTION_REASONS)[number];

// The worker-side refusals of capacity reservation section 8 that intake
// raises; admission pressure joins them with the operational limits.
export const ASSIGNMENT_REFUSAL_REASONS = Object.freeze([
  'resource-ceiling-exceeded',
  'control-not-enforceable',
  'worker-slots-exhausted',
  'worker-capacity-exhausted',
] as const);

export type AssignmentRefusalReason = (typeof ASSIGNMENT_REFUSAL_REASONS)[number];

export interface ProtocolWindow {
  readonly minimum: number;
  readonly maximum: number;
}

export type CommandRejection =
  | {
    readonly kind: 'command-rejected';
    readonly commandType: string;
    readonly reason: CommandRejectionReason;
    readonly supportedProtocolVersions: ProtocolWindow;
  }
  | { readonly kind: 'assignment-refused'; readonly assignment: AssignmentRef; readonly reason: AssignmentRefusalReason };

// `digest` identifies the command's content, so a reused `commandId` with
// other content is a conflict, never a duplicate.
export type JournaledCommand = {
  readonly commandId: CommandId;
  readonly digest: string;
  readonly correlationId: CorrelationId;
} & (
  | { readonly outcome: 'accepted'; readonly kind: 'assignment'; readonly intent: LaunchIntent }
  | { readonly outcome: 'accepted'; readonly kind: 'cancellation'; readonly target: CancellationTarget }
  | { readonly outcome: 'accepted'; readonly kind: 'assignment-end'; readonly assignmentId: AssignmentId }
  | { readonly outcome: 'rejected'; readonly kind: string; readonly rejection: CommandRejection }
);

export type CommandRecording =
  | { readonly kind: 'recorded' }
  | { readonly kind: 'duplicate' };

// `expired`: no usable grant can come of the operation, as after an
// `expired` answer or a deadline passed without a decision.
export const AUTHORIZATION_OUTCOMES = Object.freeze(['pending', 'granted', 'rejected-retryable', 'rejected-final', 'expired'] as const);

export type AuthorizationOutcome = (typeof AUTHORIZATION_OUTCOMES)[number];

export interface JournaledAuthorization {
  readonly operationId: OperationId;
  readonly outcome: AuthorizationOutcome;
  readonly launchAuthId?: LaunchAuthId;
  readonly rejection?: LaunchRejectionReason;
}

// `state` is absent before a grant; `uncertain` is evidence beside it, never
// a state (contract section 5).
export interface JournaledExecution {
  readonly executionId: ExecutionId;
  readonly assignmentId: AssignmentId;
  readonly state?: ExecutionState;
  readonly recordWritten: boolean;
  readonly uncertain: boolean;
  readonly authorizations: readonly JournaledAuthorization[];
}

export interface JournaledCancellation {
  readonly commandId: CommandId;
  readonly target: CancellationTarget;
  readonly evidenceRecorded: boolean;
}

export interface JournalSnapshot {
  readonly intents: readonly JournaledIntent[];
  readonly cancellations: readonly JournaledCancellation[];
  readonly executions: readonly JournaledExecution[];
}

// A snapshot for `worker.inventory.reported`, with the last sequence it
// reflects (0 before any); `snapshot` grows with every inventory taken.
export interface JournalInventory {
  readonly snapshot: number;
  readonly throughSequence: number;
  readonly journal: JournalSnapshot;
}

// The capacity and protocol window of `worker.capacity.declared`.
export interface DeclaredCapacity {
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly enforceableControls: readonly string[];
  readonly protocolVersions: ProtocolWindow;
}

// The command an observation answers, for its correlation.
export interface CommandCause {
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
}

// The child a supervisor spawned, as its `handle` names it (supervisor
// identity contract, section 2).
export interface ExecutionProcess {
  readonly platform: 'linux' | 'darwin';
  readonly bootId: string;
  readonly pid: number;
  readonly startTime: number;
  readonly processGroupId: number;
}

// The evidence that an execution's whole process set is gone (section 8).
export const TERMINATION_EVIDENCE_KINDS = Object.freeze([
  'containment-empty',
  'process-group-empty',
  'never-spawned',
  'boot-changed',
  'namespace-ended',
] as const);

export type TerminationEvidenceKind = (typeof TERMINATION_EVIDENCE_KINDS)[number];

// An execution's `exit` record as the worker reports it.
export interface ExecutionExit {
  readonly status: ExitStatus;
  readonly startProven: boolean;
  readonly spawnFailure?: string;
  readonly termination: TerminationEvidenceKind;
}

// The execution an execution fact is about, with its assignment.
export interface ExecutionSubject extends AssignmentRef {
  readonly executionId: ExecutionId;
}

// The facts a worker reports; the worker maps them to wire messages.
export type ObservationFact =
  | ({ readonly kind: 'command-rejected' } & CommandCause & {
    readonly commandType: string;
    readonly reason: CommandRejectionReason;
    readonly supportedProtocolVersions: ProtocolWindow;
  })
  | ({ readonly kind: 'assignment-accepted' } & CommandCause & AssignmentRef)
  | ({ readonly kind: 'assignment-refused' } & CommandCause & AssignmentRef & { readonly reason: AssignmentRefusalReason })
  | { readonly kind: 'capacity-declared'; readonly declaration: number; readonly capacity: DeclaredCapacity }
  | ({ readonly kind: 'launch-rejected' } & ExecutionSubject & {
    readonly operationId: OperationId;
    readonly reason: LaunchRejectionReason;
  })
  | ({ readonly kind: 'execution-started' } & ExecutionSubject & {
    readonly launchAuthId: LaunchAuthId;
    readonly recoveryEpoch: RecoveryEpoch;
    readonly process: ExecutionProcess;
  })
  | ({ readonly kind: 'execution-exited' } & ExecutionSubject & { readonly exit: ExecutionExit })
  | ({ readonly kind: 'execution-not-started' } & ExecutionSubject)
  | ({ readonly kind: 'execution-uncertain' } & ExecutionSubject & { readonly evidenceCounter: number })
  | ({ readonly kind: 'termination-unproven' } & ExecutionSubject & { readonly survivors: readonly ExecutionProcess[] })
  | ({ readonly kind: 'cancellation-not-applied' } & ExecutionSubject & { readonly commandId: CommandId });

export interface OutboxEntry {
  readonly position: ObservationPosition;
  readonly fact: ObservationFact;
  readonly recordedAt: Instant;
}
