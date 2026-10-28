import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { RunCredential } from '@taskelith/integrations';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import type { CodeHeadIdentity, RepositoryId } from './code-head.js';

// Paths relative to `dataRoot` (G3 plan D4 (a), contract section 2).
export const WORKSPACE_LAYOUT = Object.freeze({
  root: 'worker/workspaces',
  checkout: 'checkout',
  // The worker's own record of the workspace, beside its checkout.
  metadata: 'workspace',
  // The worker's hand-off state, present while the checkout is handed off.
  handOffRecord: 'handed-off',
  stagingPrefix: '.staging-',
  removingPrefix: '.removing-',
});

// Modes where the execution account differs from the worker's (section 2).
export const WORKSPACE_MODES = Object.freeze({
  // The attempt directory: the execution group may pass, not list.
  attempt: 0o710,
  // Set-group-ID from creation, so every entry gets the execution group.
  checkoutReclaimed: 0o2700,
  checkoutHandedOff: 0o2770,
  metadata: 0o600,
  handOffRecord: 0o600,
});

export const TASK_BRANCH_PREFIX = 'taskelith/';

export const RECLAIM_CONTAINMENT_PREFIX = 'reclaim-';

// A workspace name: a readable prefix of the identifier and a digest of it
// (contract section 2), so any identifier gives a safe, distinct name.
export const WORKSPACE_NAME_RULES = Object.freeze({
  prefixMaxLength: 40,
  digestHexLength: 32,
});

// SHA-256 of the identifier's UTF-8 bytes as 64 lowercase hexadecimal
// characters, supplied by the adapter; a name keeps its first 32.
export type IdentifierDigest = (identifier: string) => string;

const OUTSIDE_NAME_CHARACTERS = /[^A-Za-z0-9_-]/gu;
const LEADING_SEPARATORS = /^[_-]+/;

export const WORKSPACE_KINDS = Object.freeze(['task-branch', 'at-head'] as const);

export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

// Reported in this order; a workspace is clean when none applies.
export const DIRTY_REASONS = Object.freeze(['modified', 'untracked', 'operation-in-progress', 'off-branch'] as const);

export type DirtyReason = (typeof DIRTY_REASONS)[number];

// The `reason` detail of a workspace failure (contract section 9).
export const WORKSPACE_FAILURE_REASONS = Object.freeze([
  'head-mismatch',
  'workspace-dirty',
  'credential-out-of-scope',
  'remote-moved',
  'not-fast-forward',
  'read-only-workspace',
  'workspace-handed-off',
  'other-workspace-handed-off',
  'reclaim-failed',
  'unsafe-checkout',
  'gitlink-in-tree',
  'insecure-remote',
  'git-client-mismatch',
] as const);

export type WorkspaceFailureReason = (typeof WORKSPACE_FAILURE_REASONS)[number];

export const HEAD_SNAPSHOT_EVIDENCE_KIND = 'code-head-snapshot';

// One entry of a tree, with Git's file modes and exact file bytes.
export type TreeEntry =
  | { readonly type: 'file'; readonly mode: '100644' | '100755'; readonly content: Uint8Array }
  | { readonly type: 'link'; readonly target: string };

// An entry as `git ls-tree` lists it; a snapshot refuses a gitlink.
export type GitTreeEntry = TreeEntry | { readonly type: 'gitlink'; readonly commit: string };

// The run credential of the SCM port, passed per remote operation and
// never stored in the workspace (contract section 7).
export type WorkspaceCredential = Pick<RunCredential, 'credentialId' | 'secret' | 'repositories' | 'permissions'>;

export type RemoteAccess = 'read-code' | 'write-code';

// Plain HTTP to 127.0.0.1 only where a test composes the adapter.
export type RemoteTransportPolicy = 'https-only' | 'https-or-loopback-http';

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

export function workspaceDirectoryName(attemptId: AttemptId, digest: IdentifierDigest): string {
  return workspaceName(attemptId, digest);
}

export function taskBranchName(taskId: TaskId, digest: IdentifierDigest): string {
  return `${TASK_BRANCH_PREFIX}${workspaceName(taskId, digest)}`;
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

// HTTPS without user information, so no secret is ever part of a URL.
export function checkRemoteTransport(remote: string, policy: RemoteTransportPolicy): Result<void> {
  const url = URL.canParse(remote) ? new URL(remote) : undefined;
  const loopbackHttp = policy === 'https-or-loopback-http' && url?.protocol === 'http:' && url.hostname === '127.0.0.1';
  const secure = url !== undefined && (url.protocol === 'https:' || loopbackHttp);
  if (secure && url.username === '' && url.password === '') return ok(undefined);
  return workspaceFailure('invalid', 'insecure-remote', 'the remote must be an HTTPS URL without user information');
}

// The only push options: atomic, leased on the expected head, or on an
// absent branch when none is expected (contract section 8).
export function taskBranchPushOptions(branch: string, expectedRemoteHead: string | null): readonly string[] {
  return ['--atomic', `--force-with-lease=refs/heads/${branch}:${expectedRemoteHead ?? ''}`];
}

// The reclaim program's containment, under the worker's containment parent.
export function reclaimContainmentName(attemptId: AttemptId, digest: IdentifierDigest): string {
  return `${RECLAIM_CONTAINMENT_PREFIX}${workspaceDirectoryName(attemptId, digest)}`;
}

export function workspaceFailure(
  code: 'invalid' | 'forbidden' | 'conflict' | 'precondition-failed',
  reason: WorkspaceFailureReason,
  message: string,
): Result<never> {
  return err(failure(code, message, { reason }));
}

function workspaceName(identifier: string, digestOf: IdentifierDigest): string {
  const { prefixMaxLength, digestHexLength } = WORKSPACE_NAME_RULES;
  const readable = identifier.replace(OUTSIDE_NAME_CHARACTERS, '_').replace(LEADING_SEPARATORS, '');
  const prefix = readable.slice(0, prefixMaxLength);
  const digest = digestOf(identifier).slice(0, digestHexLength);
  return prefix === '' ? digest : `${prefix}-${digest}`;
}
