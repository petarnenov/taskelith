export {
  isSameCodeHead,
  parseCodeHeadIdentity,
  parseGitObjectId,
  type CodeHeadIdentity,
  type CodeHeadInput,
  type GitObjectId,
  type RepositoryId,
} from './domain/code-head.js';
export {
  DIRTY_REASONS,
  HEAD_SNAPSHOT_EVIDENCE_KIND,
  TASK_BRANCH_PREFIX,
  WORKSPACE_FAILURE_REASONS,
  WORKSPACE_KINDS,
  WORKSPACE_LAYOUT,
  checkCredentialScope,
  cleanHead,
  taskBranchName,
  workspaceDirectoryName,
  workspaceFailure,
  type DirtyReason,
  type HeadSnapshot,
  type RemoteAccess,
  type RepositoryBinding,
  type Workspace,
  type WorkspaceCredential,
  type WorkspaceFailureReason,
  type WorkspaceKind,
  type WorkspaceStatus,
  type WorkspaceTarget,
} from './domain/workspace.js';
export { WORKSPACE_CONFORMANCE } from './ports/workspace-conformance.js';
export type { FixtureCredentials, WorkspaceFixture } from './ports/workspace-fixture.js';
export type {
  PrepareWorkspace,
  PushTaskBranch,
  TaskBranchPublisher,
  WorkspaceHeads,
  WorkspaceLifecycle,
  WorkspaceProvider,
} from './ports/workspace-provider.js';
