import type { Identifier, Instant } from '@taskelith/kernel';
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

export interface LaunchIntent {
  readonly assignmentId: AssignmentId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly admissionId: AdmissionId;
  readonly admissionGeneration: Generation;
}

export type CancellationTarget =
  | { readonly kind: 'attempt'; readonly attemptId: AttemptId }
  | { readonly kind: 'execution'; readonly executionId: ExecutionId };

// `digest` identifies the command's content, so a reused `commandId` with
// other content is a conflict, never a duplicate. Item 8 names the reasons.
export type JournaledCommand = {
  readonly commandId: CommandId;
  readonly digest: string;
} & (
  | { readonly outcome: 'accepted'; readonly kind: 'assignment'; readonly intent: LaunchIntent }
  | { readonly outcome: 'accepted'; readonly kind: 'cancellation'; readonly target: CancellationTarget }
  | { readonly outcome: 'rejected'; readonly kind: string; readonly reason: string }
);

export type CommandRecording =
  | { readonly kind: 'recorded' }
  | { readonly kind: 'duplicate' };

export const AUTHORIZATION_OUTCOMES = Object.freeze(['pending', 'granted', 'rejected-retryable', 'rejected-final'] as const);

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
  readonly authorizations: readonly JournaledAuthorization[];
}

export interface JournaledCancellation {
  readonly commandId: CommandId;
  readonly target: CancellationTarget;
  readonly evidenceRecorded: boolean;
}

export interface JournalSnapshot {
  readonly intents: readonly LaunchIntent[];
  readonly cancellations: readonly JournaledCancellation[];
  readonly executions: readonly JournaledExecution[];
}

// The facts a worker reports; item 8 maps them to wire messages.
export type ObservationFact =
  | { readonly kind: 'command-rejected'; readonly commandId: CommandId; readonly reason: string }
  | {
    readonly kind: 'launch-rejected';
    readonly executionId: ExecutionId;
    readonly operationId: OperationId;
    readonly reason: LaunchRejectionReason;
  }
  | { readonly kind: 'execution-started'; readonly executionId: ExecutionId; readonly launchAuthId: LaunchAuthId }
  | { readonly kind: 'execution-exited'; readonly executionId: ExecutionId; readonly status: ExitStatus }
  | { readonly kind: 'execution-not-started'; readonly executionId: ExecutionId }
  | { readonly kind: 'execution-uncertain'; readonly executionId: ExecutionId; readonly evidenceCounter: number };

export interface OutboxEntry {
  readonly position: ObservationPosition;
  readonly fact: ObservationFact;
  readonly recordedAt: Instant;
}
