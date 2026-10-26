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

// What an adapter's test supplies, fresh for each case (contract section 12).
// Native helpers act as an agent or another party would, beside the port.
export interface WorkspaceFixture {
  readonly provider: WorkspaceProvider;
  readonly binding: RepositoryBinding;
  readonly credentials: FixtureCredentials;
  // A file of the base branch, and a path its ignore rules ignore.
  readonly trackedPath: string;
  readonly ignoredPath: string;
  // A new provider over the same data root, as after a worker restart.
  reopen(): WorkspaceProvider;
  writeFile(attemptId: AttemptId, path: string, text: string): Promise<void>;
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
  // Every byte under the workspace's directory, read as text.
  workspaceText(attemptId: AttemptId): Promise<string>;
  // Every control record under `worker/` with its content, as one text.
  controlRecords(): Promise<string>;
  // The snapshot's files and their text, decoded by the adapter's format.
  readSnapshot(content: Uint8Array): Promise<Readonly<Record<string, string>>>;
  interruptPrepare(attemptId: AttemptId): Promise<void>;
  interruptRemove(attemptId: AttemptId): Promise<void>;
  // Staging and removing entries left under `worker/workspaces/`.
  leftovers(): Promise<readonly string[]>;
}
