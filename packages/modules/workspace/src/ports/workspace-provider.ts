import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import type { CodeHeadIdentity, GitObjectId } from '../domain/code-head.js';
import type {
  HeadSnapshot,
  RepositoryBinding,
  Workspace,
  WorkspaceCredential,
  WorkspaceStatus,
  WorkspaceTarget,
} from '../domain/workspace.js';

export interface PrepareWorkspace {
  readonly attemptId: AttemptId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly binding: RepositoryBinding;
  readonly target: WorkspaceTarget;
  readonly credential: WorkspaceCredential;
}

export interface RemoteHeadRequest {
  readonly attemptId: AttemptId;
  readonly credential: WorkspaceCredential;
}

export interface PushTaskBranch {
  readonly attemptId: AttemptId;
  readonly credential: WorkspaceCredential;
  // The task branch's remote head the caller last saw; null when absent.
  readonly expectedRemoteHead: GitObjectId | null;
}

// Fresh clone per attempt under `worker/workspaces/` (contract section 3).
export interface WorkspaceLifecycle {
  // Refusals in the order of contract section 9; a refusal creates no
  // workspace and leaves an existing one unchanged.
  prepare(request: PrepareWorkspace): Promise<Result<Workspace>>;
  // Ready workspaces only, in code point order of the attempt.
  list(): Promise<readonly AttemptId[]>;
  // Refuses a dirty workspace (`workspace-dirty`); an absent one succeeds.
  // Nothing outside the workspace is touched.
  remove(attemptId: AttemptId): Promise<Result<void>>;
  // Removes leftovers of an interrupted prepare or remove.
  sweep(): Promise<void>;
  // Opens the checkout to the execution account; Git work on it is then
  // refused with `workspace-handed-off` until `reclaim` (section 3).
  handOff(attemptId: AttemptId): Promise<Result<void>>;
  // Only after the attempt's process sets are proven empty; idempotent.
  reclaim(attemptId: AttemptId): Promise<Result<void>>;
}

// Read by verification, review, and the evidence path (sections 6 and 10).
export interface WorkspaceHeads {
  inspect(attemptId: AttemptId): Promise<Result<WorkspaceStatus>>;
  // `precondition-failed` with reason `workspace-dirty` when not clean.
  snapshot(attemptId: AttemptId): Promise<Result<HeadSnapshot>>;
}

// Fast-forward only, never forced, task branch only (contract section 8).
export interface TaskBranchPublisher {
  // The remote task branch head now; null while the branch is absent.
  readRemoteHead(request: RemoteHeadRequest): Promise<Result<GitObjectId | null>>;
  push(request: PushTaskBranch): Promise<Result<CodeHeadIdentity>>;
}

export interface WorkspaceProvider extends WorkspaceLifecycle, WorkspaceHeads, TaskBranchPublisher {}
