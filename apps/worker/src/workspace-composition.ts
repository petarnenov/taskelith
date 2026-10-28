import { readFileSync } from 'node:fs';
import type { AttemptId } from '@taskelith/execution';
import {
  GitWorkspaces,
  LinuxReclaimHost,
  ProcessGroupReclaimHost,
  verifyGitClient,
  type HandedOffWorkspace,
  type ReclaimHost,
  type VerifiedGitClient,
} from '@taskelith/git-workspace';
import { ok, type Result } from '@taskelith/kernel';
import { GIT_CLIENT_PINS, workspaceFailure, type GitClientPin } from '@taskelith/workspace';
import { faultMessage } from './fault-code.js';
import type { WorkerSettings } from './settings.js';

// What the worker's start and its slot service use of the Git workspace
// adapter; only this module names the adapter.
export interface WorkerWorkspace {
  sweep(): Promise<void>;
  handOffRecords(): Promise<readonly HandedOffWorkspace[]>;
  handOff(attemptId: AttemptId): Promise<Result<void>>;
  reclaim(attemptId: AttemptId): Promise<Result<void>>;
}

// The host's side of the composition, replaced in tests.
export interface WorkspaceHost {
  // The content of `fs.protected_hardlinks`; a read error throws.
  readProtectedHardlinks(): string;
  setUmask(mask: number): void;
  verifyGitClient(pin: GitClientPin): Promise<Result<VerifiedGitClient>>;
}

export const WORKSPACE_HOST: WorkspaceHost = Object.freeze({
  readProtectedHardlinks: () => readFileSync('/proc/sys/fs/protected_hardlinks', 'utf8'),
  setUmask: (mask: number) => void process.umask(mask),
  verifyGitClient,
});

// The clone gives the execution group the owner's bits (contract section 2).
export const CLONE_UMASK = 0o007;

// Only a worker with a launch command runs executions, so only it holds
// workspaces; a separate execution account adds the Linux preconditions.
export async function composeWorkspace(settings: WorkerSettings, host: WorkspaceHost = WORKSPACE_HOST): Promise<Result<WorkerWorkspace | undefined>> {
  const { launch } = settings;
  if (launch === undefined) return ok(undefined);
  const account = launch.executionAccount;
  if (account !== undefined) {
    const links = checkProtectedHardlinks(host);
    if (!links.ok) return links;
  }
  const client = await host.verifyGitClient(GIT_CLIENT_PINS[settings.host.platform]);
  if (!client.ok) return client;
  if (account !== undefined) host.setUmask(CLONE_UMASK);
  return ok(new GitWorkspaces({
    dataRoot: settings.dataRoot, client: client.value, remoteTransport: 'https-only', reclaimHost: reclaimHostFor(settings),
  }));
}

// Exactly `1`, with an optional newline; an unreadable setting is never
// taken as `1` (contract section 2).
function checkProtectedHardlinks(host: WorkspaceHost): Result<void> {
  let content: string;
  try {
    content = host.readProtectedHardlinks();
  } catch (error) {
    return hardlinksUnprotected(faultMessage('fs.protected_hardlinks cannot be read', error));
  }
  if (/^1\n?$/.test(content)) return ok(undefined);
  return hardlinksUnprotected('fs.protected_hardlinks must be 1 for a worker whose executions run under a separate account');
}

function hardlinksUnprotected(message: string): Result<never> {
  return workspaceFailure('precondition-failed', 'hardlinks-unprotected', message);
}

// The settings give a Linux launch both the account and the parent; one
// account runs the program in a process group of its own.
export function reclaimHostFor(settings: WorkerSettings): ReclaimHost {
  const account = settings.launch?.executionAccount;
  if (account === undefined) return new ProcessGroupReclaimHost();
  return new LinuxReclaimHost({ containmentParent: settings.containmentParent!, executionAccount: account });
}
