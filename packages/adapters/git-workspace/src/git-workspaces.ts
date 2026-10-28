import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type {
  HeadSnapshot,
  IdentifierDigest,
  PrepareWorkspace,
  RemoteTransportPolicy,
  Workspace,
  WorkspaceHeads,
  WorkspaceLifecycle,
  WorkspaceStatus,
} from '@taskelith/workspace';
import type { CrashPointHook } from './crash-points.js';
import type { VerifiedGitClient } from './git-client-gate.js';

export interface GitWorkspacesOptions {
  readonly dataRoot: string;
  readonly client: VerifiedGitClient;
  readonly remoteTransport: RemoteTransportPolicy;
  readonly crashPoints?: CrashPointHook;
}

export type LocalWorkspaceOperations = Pick<WorkspaceLifecycle, 'prepare' | 'list' | 'remove' | 'sweep'> & WorkspaceHeads;

export const sha256IdentifierDigest: IdentifierDigest = () => {
  throw new Error('not implemented');
};

export class GitWorkspaces implements LocalWorkspaceOperations {
  constructor(readonly options: GitWorkspacesOptions) {}

  prepare(_request: PrepareWorkspace): Promise<Result<Workspace>> {
    throw new Error('not implemented');
  }

  list(): Promise<readonly AttemptId[]> {
    throw new Error('not implemented');
  }

  remove(_attemptId: AttemptId): Promise<Result<void>> {
    throw new Error('not implemented');
  }

  sweep(): Promise<void> {
    throw new Error('not implemented');
  }

  inspect(_attemptId: AttemptId): Promise<Result<WorkspaceStatus>> {
    throw new Error('not implemented');
  }

  snapshot(_attemptId: AttemptId): Promise<Result<HeadSnapshot>> {
    throw new Error('not implemented');
  }
}
