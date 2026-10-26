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

// One entry of a tree, with Git's file modes.
export type TreeEntry =
  | { readonly type: 'file'; readonly mode: '100644' | '100755'; readonly content: string }
  | { readonly type: 'link'; readonly target: string };

// What an adapter's test supplies, fresh for each case (contract section 12).
// Native helpers act as an agent or another party would, beside the port.
export interface WorkspaceFixture {
  readonly provider: WorkspaceProvider;
  readonly binding: RepositoryBinding;
  readonly credentials: FixtureCredentials;
  // The base branch's tree; it holds `trackedPath` and ignores `ignoredPath`.
  readonly baseTree: Readonly<Record<string, TreeEntry>>;
  readonly trackedPath: string;
  readonly ignoredPath: string;
  // A new provider over the same data root, as after a worker restart.
  reopen(): WorkspaceProvider;
  writeFile(attemptId: AttemptId, path: string, text: string): Promise<void>;
  writeExecutable(attemptId: AttemptId, path: string, text: string): Promise<void>;
  writeLink(attemptId: AttemptId, path: string, target: string): Promise<void>;
  // A symbolic link in the workspace to a control record outside it.
  linkToControlRecord(attemptId: AttemptId, path: string): Promise<void>;
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
  // Every byte under the workspace's directory, read as text.
  workspaceText(attemptId: AttemptId): Promise<string>;
  // Every control record kind of the worker journal contract section 2,
  // with its content, as one text.
  controlRecords(): Promise<string>;
  // The snapshot's tree, decoded by the adapter's format.
  readSnapshot(content: Uint8Array): Promise<Readonly<Record<string, TreeEntry>>>;
  // A staging entry holding a symbolic link to a control record.
  interruptPrepare(attemptId: AttemptId): Promise<void>;
  // The workspace renamed to its removing entry, not yet deleted.
  interruptRemove(attemptId: AttemptId): Promise<void>;
  // A staging entry that is itself a link to a control record directory.
  leaveLinkedLeftover(attemptId: AttemptId): Promise<void>;
  // Staging and removing entries left under `worker/workspaces/`.
  leftovers(): Promise<readonly string[]>;
}
