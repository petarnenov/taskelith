import type { AttemptId } from '@taskelith/execution';
import type { RepositoryBinding, WorkspaceCredential } from '../domain/workspace.js';
import type { WorkspaceProvider } from './workspace-provider.js';

export interface FixtureCredentials {
  // `read-code` on the binding's repository only.
  readonly read: WorkspaceCredential;
  // `read-code` and `write-code` on the binding's repository.
  readonly write: WorkspaceCredential;
  // Every permission, on another repository only.
  readonly foreign: WorkspaceCredential;
}

// One entry of a tree, with Git's file modes and exact file bytes.
export type TreeEntry =
  | { readonly type: 'file'; readonly mode: '100644' | '100755'; readonly content: Uint8Array }
  | { readonly type: 'link'; readonly target: string };

// What an adapter's test supplies, fresh for each case (contract section 12).
// Native helpers act as an agent or another party would, beside the port.
export interface WorkspaceFixture {
  readonly provider: WorkspaceProvider;
  // The canonical data root, without symbolic links, whose
  // `worker/workspaces/` holds the provider's workspaces.
  readonly dataRoot: string;
  readonly binding: RepositoryBinding;
  readonly credentials: FixtureCredentials;
  // The base branch's tree; it holds `trackedPath` and ignores `ignoredPath`.
  readonly baseTree: Readonly<Record<string, TreeEntry>>;
  readonly trackedPath: string;
  readonly ignoredPath: string;
  // Executions run under a separate account that all of them share, so the
  // provider holds one handed-off workspace at a time (section 3).
  readonly separateExecutionIdentity: boolean;
  // A new provider over the same data root, as after a worker restart.
  reopen(): WorkspaceProvider;
  writeFile(attemptId: AttemptId, path: string, text: string): Promise<void>;
  writeBytes(attemptId: AttemptId, path: string, content: Uint8Array): Promise<void>;
  writeExecutable(attemptId: AttemptId, path: string, text: string): Promise<void>;
  writeLink(attemptId: AttemptId, path: string, target: string): Promise<void>;
  // A symbolic link in the workspace to a control record outside it.
  linkToControlRecord(attemptId: AttemptId, path: string): Promise<void>;
  // Stages the path's working tree entry, or its removal, in the index.
  stage(attemptId: AttemptId, path: string): Promise<void>;
  // Commits every change on the current branch, or an empty commit.
  commitAll(attemptId: AttemptId, message: string): Promise<void>;
  // Leaves an operation such as a merge unfinished.
  beginOperation(attemptId: AttemptId): Promise<void>;
  switchBranch(attemptId: AttemptId, branch: string): Promise<void>;
  remoteHead(branch: string): Promise<string | undefined>;
  // A commit by another party; creates the branch from the base if absent.
  advanceRemote(branch: string): Promise<void>;
  // Remote operations the service has seen so far, of any kind.
  remoteCalls(): Promise<number>;
  // The workspace's head commit and its tree, read natively.
  nativeHead(attemptId: AttemptId): Promise<{ readonly commit: string; readonly tree: string }>;
  // Every byte under the workspace's directory, read as text.
  workspaceText(attemptId: AttemptId): Promise<string>;
  // Every control record kind of the worker journal contract section 2,
  // with its content, as one text.
  controlRecords(): Promise<string>;
  // The snapshot's tree, decoded by the adapter's format.
  readSnapshot(content: Uint8Array): Promise<Readonly<Record<string, TreeEntry>>>;
  // A hard link outside the workspace to the checkout's file at `path`, as
  // an agent leaves one; the returned function writes through it.
  hardLinkOutside(attemptId: AttemptId, path: string): Promise<(text: string) => Promise<void>>;
  // A symbolic link inside the checkout's Git directory to a control record.
  linkInGitDirectory(attemptId: AttemptId): Promise<void>;
  // Deletes the checkout's Git directory, as an agent can.
  removeGitDirectory(attemptId: AttemptId): Promise<void>;
  // A gitfile below the checkout's top naming `gitDirectory`, as a submodule.
  nestGitFile(attemptId: AttemptId, gitDirectory: string): Promise<void>;
  // A staging entry holding a symbolic link to a control record.
  interruptPrepare(attemptId: AttemptId): Promise<void>;
  // The clean workspace renamed to its removing entry, not yet deleted.
  interruptRemove(attemptId: AttemptId): Promise<void>;
  // A staging entry that is itself a link to a control record directory.
  leaveLinkedLeftover(attemptId: AttemptId): Promise<void>;
  // Staging and removing entries left under `worker/workspaces/`.
  leftovers(): Promise<readonly string[]>;
}
