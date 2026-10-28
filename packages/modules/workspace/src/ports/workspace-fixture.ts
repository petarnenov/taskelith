import type { AttemptId } from '@taskelith/execution';
import type { IdentifierDigest, RepositoryBinding, TreeEntry, WorkspaceCredential } from '../domain/workspace.js';
import type { WorkspaceProvider } from './workspace-provider.js';

export interface FixtureCredentials {
  // `read-code` on the binding's repository only.
  readonly read: WorkspaceCredential;
  // `read-code` and `write-code` on the binding's repository.
  readonly write: WorkspaceCredential;
  // Every permission, on another repository only.
  readonly foreign: WorkspaceCredential;
}

// What an observation shows in place of a value that holds a credential.
export const REDACTED_VALUE = '<redacted>';

// What it shows for exactly `Authorization: <authorization>` of the
// credential, so that the suite can tell whose header a process carries.
export function redactedHeader(credentialId: string): string {
  return `<authorization-header:${credentialId}>`;
}

// One Git process that the adapter started, as the fixture observed it at
// its start; environment values that hold a credential are redacted.
export interface GitProcessObservation {
  readonly argv: readonly string[];
  readonly pid: number;
  // The directory the process started in.
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  // The configuration of the repository that Git finds from `cwd`, as the
  // process found it; null outside a repository.
  readonly repositoryConfig: string | null;
}

// What an adapter's test supplies, fresh for each case (contract section 12).
// Native helpers act as an agent or another party would, beside the port.
export interface WorkspaceFixture {
  readonly provider: WorkspaceProvider;
  // The canonical data root, without symbolic links, whose
  // `worker/workspaces/` holds the provider's workspaces.
  readonly dataRoot: string;
  // The digest the provider names its workspaces and task branches with.
  readonly identifierDigest: IdentifierDigest;
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
  // Commits a gitlink at `path`, as a submodule's entry, and nothing else.
  commitGitlink(attemptId: AttemptId, path: string): Promise<void>;
  // Every Git process the adapter started so far, in start order.
  gitProcesses(): Promise<readonly GitProcessObservation[]>;
  // Adds the setting to the checkout's `.git/config` as `git config` does,
  // as an agent can.
  plantGitSetting(attemptId: AttemptId, key: string, value: string): Promise<void>;
  // The checkout's `.git/config` as it is on disk.
  gitConfig(attemptId: AttemptId): Promise<string>;
  // A staging entry holding a symbolic link to a control record.
  interruptPrepare(attemptId: AttemptId): Promise<void>;
  // The clean workspace renamed to its removing entry, not yet deleted.
  interruptRemove(attemptId: AttemptId): Promise<void>;
  // A staging entry that is itself a link to a control record directory.
  leaveLinkedLeftover(attemptId: AttemptId): Promise<void>;
  // Staging and removing entries left under `worker/workspaces/`.
  leftovers(): Promise<readonly string[]>;
}
