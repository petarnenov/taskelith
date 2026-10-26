import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { RunCredential } from '@taskelith/integrations';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import type { CodeHeadIdentity, RepositoryId } from './code-head.js';

// Paths relative to `dataRoot` (G3 plan D4 (a), contract section 2).
export const WORKSPACE_LAYOUT = Object.freeze({
  root: 'worker/workspaces',
  checkout: 'checkout',
  stagingPrefix: '.staging-',
  removingPrefix: '.removing-',
});

export const TASK_BRANCH_PREFIX = 'taskelith/';

// A safe single path segment and Git ref component; never `.` or `..`.
const WORKSPACE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const WORKSPACE_KINDS = Object.freeze(['task-branch', 'at-head'] as const);

export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

// Reported in this order; a workspace is clean when none applies.
export const DIRTY_REASONS = Object.freeze(['modified', 'untracked', 'operation-in-progress', 'off-branch'] as const);

export type DirtyReason = (typeof DIRTY_REASONS)[number];

// The `reason` detail of a workspace failure (contract section 9).
export const WORKSPACE_FAILURE_REASONS = Object.freeze([
  'unsafe-name',
  'workspace-dirty',
  'credential-out-of-scope',
  'remote-moved',
  'not-fast-forward',
  'read-only-workspace',
] as const);

export type WorkspaceFailureReason = (typeof WORKSPACE_FAILURE_REASONS)[number];

export const HEAD_SNAPSHOT_EVIDENCE_KIND = 'code-head-snapshot';

// The run credential of the SCM port, passed per remote operation and
// never stored in the workspace (contract section 7).
export type WorkspaceCredential = Pick<RunCredential, 'credentialId' | 'secret' | 'repositories' | 'permissions'>;

export type RemoteAccess = 'read-code' | 'write-code';

export interface RepositoryBinding {
  readonly repository: RepositoryId;
  readonly remote: string;
  readonly baseBranch: string;
}

export type WorkspaceTarget =
  | { readonly kind: 'task-branch' }
  | { readonly kind: 'at-head'; readonly head: CodeHeadIdentity };

export interface Workspace {
  readonly attemptId: AttemptId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly kind: WorkspaceKind;
  // The task branch; null for an `at-head` workspace.
  readonly branch: string | null;
  readonly workingDirectory: string;
  readonly head: CodeHeadIdentity;
}

export interface WorkspaceStatus {
  readonly head: CodeHeadIdentity;
  readonly branch: string | null;
  readonly dirtyReasons: readonly DirtyReason[];
}

// The head's tree only, in bytes that depend on nothing else.
export interface HeadSnapshot {
  readonly head: CodeHeadIdentity;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export function workspaceDirectoryName(attemptId: AttemptId): Result<string> {
  return safeName('attemptId', attemptId);
}

export function taskBranchName(taskId: TaskId): Result<string> {
  const name = safeName('taskId', taskId);
  return name.ok ? ok(`${TASK_BRANCH_PREFIX}${name.value}`) : name;
}

// A head for head-bound evidence comes only from a clean workspace.
export function cleanHead(status: WorkspaceStatus): Result<CodeHeadIdentity> {
  if (status.dirtyReasons.length === 0) return ok(status.head);
  return workspaceFailure('precondition-failed', 'workspace-dirty', `the workspace is dirty: ${status.dirtyReasons.join(', ')}`);
}

// Checked before any remote call; the service checks again.
export function checkCredentialScope(credential: WorkspaceCredential, repository: RepositoryId, access: RemoteAccess): Result<void> {
  if (credential.repositories.includes(repository) && credential.permissions.includes(access)) return ok(undefined);
  return workspaceFailure('forbidden', 'credential-out-of-scope', `credential ${credential.credentialId} lacks ${access} on ${repository}`);
}

export function workspaceFailure(
  code: 'invalid' | 'forbidden' | 'conflict' | 'precondition-failed',
  reason: WorkspaceFailureReason,
  message: string,
): Result<never> {
  return err(failure(code, message, { reason }));
}

function safeName(field: string, text: string): Result<string> {
  if (WORKSPACE_NAME.test(text)) return ok(text);
  return workspaceFailure('invalid', 'unsafe-name', `${field} must be letters, digits, '-' or '_', starting with a letter or digit`);
}
