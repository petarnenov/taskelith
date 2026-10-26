import type { Instant, Result } from '@taskelith/kernel';
import type { ExecutionId, LaunchAuthId, OperationId } from '../domain/identifiers.js';
import type { LaunchRequest } from '../domain/launch-authorization.js';
import type { LaunchGrant } from '../domain/launch-grant.js';
import type { LaunchRejection } from '../domain/launch-rejection.js';
import type {
  CommandId,
  CommandRecording,
  JournalBinding,
  DeclaredCapacity,
  ExecutionExit,
  ExecutionProcess,
  JournaledCommand,
  JournalInventory,
  JournalSnapshot,
  OutboxEntry,
} from '../domain/journal-records.js';
import type { Sequence } from '../domain/observation-sequence.js';

// The worker's durable journal (worker journal contract). Each `record`
// call is one commit; a success means the commit is durable.
export interface WorkerJournal {
  readonly binding: JournalBinding;
  // W1: before the command is acknowledged.
  recordCommand(command: JournaledCommand): Result<CommandRecording>;
  // W2: before the first launch authorization request of the operation.
  beginAuthorization(request: LaunchRequest): Result<void>;
  // W3: before `intent` is written, or before any retry.
  recordGrant(grant: LaunchGrant): Result<void>;
  recordLaunchRejection(operationId: OperationId, rejection: LaunchRejection): Result<void>;
  recordAuthorizationExpired(operationId: OperationId): Result<void>;
  // W4: before the supervisor starts.
  recordExecutionRecordWritten(executionId: ExecutionId): Result<void>;
  // W5s and W5e: before anything leaves the execution record.
  recordStart(executionId: ExecutionId, launchAuthId: LaunchAuthId, process: ExecutionProcess): Result<void>;
  recordExit(executionId: ExecutionId, exit: ExecutionExit): Result<void>;
  // W6: after the seal is durable.
  recordNotStarted(executionId: ExecutionId): Result<void>;
  recordUncertain(executionId: ExecutionId): Result<void>;
  // Once per execution, and once per cancellation and execution.
  recordTerminationUnproven(executionId: ExecutionId, survivors: readonly ExecutionProcess[]): Result<void>;
  recordCancellationNotApplied(commandId: CommandId, executionId: ExecutionId): Result<void>;
  recordCancellationEvidence(commandId: CommandId): Result<void>;
  // Journals a declaration only when it differs from the last one.
  recordCapacity(capacity: DeclaredCapacity): Result<void>;
  snapshot(): Result<JournalSnapshot>;
  // Executions whose terminal fact is confirmed and whose record remains.
  removableRecords(): Result<readonly ExecutionId[]>;
  recordRecordRemoved(executionId: ExecutionId): Result<void>;
  // Takes the next inventory snapshot; each call gets a higher number.
  takeInventory(): Result<JournalInventory>;
  // Entries to publish now: never published in this process, or not
  // confirmed within the republication bound.
  dueForPublication(now: Instant): Result<readonly OutboxEntry[]>;
  markPublished(sequence: Sequence, at: Instant): void;
  // Cumulative confirmation by the control plane; prunes what it covers.
  confirmThrough(sequence: Sequence): Result<void>;
  close(): void;
}
