import type { Result } from '@taskelith/kernel';
import type { ArtifactId, GateId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import type { AssignmentId, AttemptId, ExecutionId, LaunchAuthId, OperationId, WorkerId } from '../domain/identifiers.js';
import type { LaunchRequest } from '../domain/launch-authorization.js';
import type { LaunchRejection } from '../domain/launch-rejection.js';

// Where a recorded grant is: the grant itself stays in its task's record.
export interface RecordedLaunch {
  readonly launchAuthId: LaunchAuthId;
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly assignmentId: AssignmentId;
  readonly executionId: ExecutionId;
  readonly workerId: WorkerId;
}

// The read of each invalidating writer (launch authorization section 5); a
// gate writer names every gate of the stage, so an added gate is found too.
export type LaunchPredicate =
  | { readonly kind: 'worker'; readonly workerId: WorkerId }
  | { readonly kind: 'assignment'; readonly assignmentId: AssignmentId }
  | { readonly kind: 'run'; readonly runId: WorkflowRunId }
  | { readonly kind: 'artifact'; readonly artifactId: ArtifactId }
  | { readonly kind: 'gates'; readonly gateIds: readonly GateId[] }
  | { readonly kind: 'all' };

// A final rejection with the values its operation was requested with.
export interface RecordedRejection {
  readonly request: LaunchRequest;
  readonly rejection: LaunchRejection;
}

// The index of the grants in the task records, which the task repository
// keeps in step, and the rejections that are final for their operation.
export interface LaunchRecords {
  // The grant of the worker's operation; another worker's is not found.
  byOperation(workerId: WorkerId, operationId: OperationId): Promise<Result<RecordedLaunch | undefined>>;
  byLaunchAuthId(launchAuthId: LaunchAuthId): Promise<Result<RecordedLaunch | undefined>>;
  // Unrevoked grants of non-terminal executions, expired or not; an empty
  // answer still reads the whole predicate.
  liveGrants(predicate: LaunchPredicate): Promise<Result<readonly RecordedLaunch[]>>;
  rejection(workerId: WorkerId, operationId: OperationId): Promise<Result<RecordedRejection | undefined>>;
  // `conflict` when the operation has a recorded rejection.
  recordRejection(recorded: RecordedRejection): Promise<Result<void>>;
}
