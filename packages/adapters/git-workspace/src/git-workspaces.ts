import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { syncPathAsync } from '@taskelith/data-root';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import {
  DIRTY_REASONS,
  GIT_NEUTRAL_DIRECTORY,
  HEAD_SNAPSHOT_CONTENT_TYPE,
  WORKSPACE_LAYOUT,
  WORKSPACE_MODES,
  checkCredentialScope,
  checkRemoteTransport,
  cleanHead,
  encodeHeadSnapshot,
  parseCodeHeadIdentity,
  taskBranchName,
  workspaceDirectoryName,
  workspaceFailure,
  type DirtyReason,
  type GitTreeEntry,
  type HeadSnapshot,
  type IdentifierDigest,
  type PrepareWorkspace,
  type RemoteTransportPolicy,
  type Workspace,
  type WorkspaceCredential,
  type WorkspaceHeads,
  type WorkspaceLifecycle,
  type WorkspaceStatus,
} from '@taskelith/workspace';
import { checkCheckoutSafety } from './checkout-safety.js';
import { NO_CRASH_POINTS, type CrashPointHook } from './crash-points.js';
import { failingFileSystemAsUnavailable } from './file-system-failure.js';
import type { VerifiedGitClient } from './git-client-gate.js';
import { succeeded, type GitRunner } from './git-runner.js';
import type { GitObjectType } from './git-objects.js';
import { indexInfo, indexMatchesTree, parseIndexEntries, type IndexEntry } from './index-entries.js';
import { parsePorcelainStatus, type PorcelainStatus } from './porcelain-status.js';
import { isPresent } from './presence.js';
import { resetRepositoryFiles, type ObjectFormat } from './repository-config.js';
import { parseBatchObjects, readHeadTree, readVerified, snapshotTree, type ListedEntry, type ObjectRead } from './tree-listing.js';
import { readWorkspaceRecord, writeWorkspaceRecord, type WorkspaceRecord } from './workspace-record.js';

export interface GitWorkspacesOptions {
  // The canonical data root, without symbolic links.
  readonly dataRoot: string;
  readonly client: VerifiedGitClient;
  // `https-or-loopback-http` only where a test composes the adapter.
  readonly remoteTransport: RemoteTransportPolicy;
  readonly crashPoints?: CrashPointHook;
}

// The operations of sub-change 16b; the remote head, the push, and the
// hand-off come with 16c and 16d.
export type LocalWorkspaceOperations = Pick<WorkspaceLifecycle, 'prepare' | 'list' | 'remove' | 'sweep'> & WorkspaceHeads;

export const sha256IdentifierDigest: IdentifierDigest = (identifier) => createHash('sha256').update(identifier, 'utf8').digest('hex');

// What `.git` holds during an unfinished merge, rebase, cherry-pick,
// revert, or bisect.
const OPERATION_MARKERS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'rebase-merge', 'rebase-apply', 'sequencer'];
const CLONE_REMOTE = 'origin';

interface OpenedWorkspace {
  readonly record: WorkspaceRecord;
  readonly checkout: string;
}

interface Start {
  readonly commit: string;
  readonly tree: string;
}

type PreparedWorkspace = Omit<Workspace, 'workingDirectory'>;

interface Examined {
  readonly status: WorkspaceStatus;
  readonly entries: readonly ListedEntry[];
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim();
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

// Resolves false when the call fails with one of `codes`; rejects otherwise.
function attempt(call: Promise<unknown>, codes: readonly string[]): Promise<boolean> {
  return call.then(() => true, (error: unknown) => {
    if (codes.includes(errorCode(error) ?? '')) return false;
    throw error;
  });
}

// The Git workspace adapter's local operations (contract sections 3, 6,
// 9, and 10), with the pinned client that passed its gate.
export class GitWorkspaces implements LocalWorkspaceOperations {
  readonly #root: string;
  readonly #git: GitRunner;
  readonly #transport: RemoteTransportPolicy;
  readonly #crashPoints: CrashPointHook;
  readonly #owner: number;

  constructor(options: GitWorkspacesOptions) {
    this.#root = join(options.dataRoot, WORKSPACE_LAYOUT.root);
    this.#git = options.client.runner;
    this.#transport = options.remoteTransport;
    this.#crashPoints = options.crashPoints ?? NO_CRASH_POINTS;
    this.#owner = process.getuid!();
  }

  prepare(request: PrepareWorkspace): Promise<Result<Workspace>> {
    return failingFileSystemAsUnavailable(() => this.#prepare(request));
  }

  // Ready workspaces from their records, in UTF-16 code unit order.
  async list(): Promise<readonly AttemptId[]> {
    const names = (await readdir(this.#root)).filter((entry) => !entry.startsWith('.'));
    const attempts = await Promise.all(names.map(async (name) => {
      const record = await readWorkspaceRecord(join(this.#root, name, WORKSPACE_LAYOUT.metadata));
      if (!record.ok) throw new Error(record.error.message);
      if (record.value === undefined) throw new Error(`the workspace ${name} has no record`);
      return record.value.attemptId;
    }));
    return attempts.sort();
  }

  remove(attemptId: AttemptId): Promise<Result<void>> {
    return failingFileSystemAsUnavailable(() => this.#remove(attemptId));
  }

  // Deletes every staging and removing entry; a link is removed as a link.
  async sweep(): Promise<void> {
    for (const entry of await readdir(this.#root)) {
      const path = join(this.#root, entry);
      if (entry.startsWith(WORKSPACE_LAYOUT.removingPrefix)) await this.#deleteRemoving(path);
      else if (entry.startsWith(WORKSPACE_LAYOUT.stagingPrefix)) await rm(path, { recursive: true, force: true });
    }
  }

  inspect(attemptId: AttemptId): Promise<Result<WorkspaceStatus>> {
    return failingFileSystemAsUnavailable(async () => {
      const opened = await this.#opened(attemptId);
      if (!opened.ok) return opened;
      const examined = await this.#examine(opened.value);
      return examined.ok ? ok(examined.value.status) : examined;
    });
  }

  snapshot(attemptId: AttemptId): Promise<Result<HeadSnapshot>> {
    return failingFileSystemAsUnavailable(() => this.#snapshot(attemptId));
  }

  // Section 9: repository, remote, credential, sources, tree, then an
  // existing workspace, which the rename into place detects atomically.
  async #prepare(request: PrepareWorkspace): Promise<Result<Workspace>> {
    const refused = this.#prepareRefusal(request);
    if (!refused.ok) return refused;
    const name = workspaceDirectoryName(request.attemptId, sha256IdentifierDigest);
    const staging = join(this.#root, `${WORKSPACE_LAYOUT.stagingPrefix}${name}`);
    if (!(await attempt(mkdir(staging, { mode: WORKSPACE_MODES.attempt }), ['EEXIST']))) {
      return err(failure('conflict', `workspace ${request.attemptId} is being prepared`));
    }
    // A failure leaves no staging entry; one after the rename into place
    // leaves the ready workspace, which `list` reports (contract section 3).
    const prepared = await failingFileSystemAsUnavailable(async () => {
      const built = await this.#build(staging, request);
      if (!built.ok) return built;
      const placed = await this.#placeStaging(staging, join(this.#root, name), request.attemptId);
      return placed.ok ? ok({ ...built.value, workingDirectory: join(this.#root, name, WORKSPACE_LAYOUT.checkout) }) : placed;
    });
    if (!prepared.ok) await rm(staging, { recursive: true, force: true });
    return prepared;
  }

  async #remove(attemptId: AttemptId): Promise<Result<void>> {
    const opened = await this.#opened(attemptId);
    if (!opened.ok) return opened.error.code === 'not-found' ? ok(undefined) : opened;
    const examined = await this.#examine(opened.value);
    if (!examined.ok) return examined;
    const clean = cleanHead(examined.value.status);
    if (!clean.ok) return clean;
    const name = workspaceDirectoryName(attemptId, sha256IdentifierDigest);
    const removing = join(this.#root, `${WORKSPACE_LAYOUT.removingPrefix}${name}`);
    this.#crashPoints.reach('WS3.before');
    // A concurrent removal of the same workspace may have renamed it first.
    if (!(await attempt(rename(join(this.#root, name), removing), ['ENOENT']))) return ok(undefined);
    this.#crashPoints.reach('WS3.after');
    await this.#deleteRemoving(removing);
    return ok(undefined);
  }

  async #snapshot(attemptId: AttemptId): Promise<Result<HeadSnapshot>> {
    const opened = await this.#opened(attemptId);
    if (!opened.ok) return opened;
    const examined = await this.#examine(opened.value);
    if (!examined.ok) return examined;
    const head = cleanHead(examined.value.status);
    if (!head.ok) return head;
    const tree = await this.#snapshotTree(opened.value, examined.value.entries);
    if (!tree.ok) return tree;
    const content = encodeHeadSnapshot(tree.value);
    if (!content.ok) return content;
    return ok({ head: head.value, contentType: HEAD_SNAPSHOT_CONTENT_TYPE, content: content.value });
  }

  #prepareRefusal(request: PrepareWorkspace): Result<void> {
    const { target, binding } = request;
    if (target.kind === 'at-head' && target.head.repository !== binding.repository) {
      return err(failure('invalid', 'the head belongs to another repository'));
    }
    const transport = checkRemoteTransport(binding.remote, this.#transport);
    if (!transport.ok) return transport;
    return checkCredentialScope(request.credential, binding.repository, 'read-code');
  }

  // The clone, its configuration, the target, and the record, all inside
  // the staging entry, which nothing reads before its rename.
  async #build(staging: string, request: PrepareWorkspace): Promise<Result<PreparedWorkspace>> {
    await chmod(staging, WORKSPACE_MODES.attempt);
    const checkout = join(staging, WORKSPACE_LAYOUT.checkout);
    await mkdir(checkout, { mode: WORKSPACE_MODES.checkoutReclaimed });
    await chmod(checkout, WORKSPACE_MODES.checkoutReclaimed);
    const cloned = await this.#clone(checkout, request.binding.remote, request.credential);
    if (!cloned.ok) return cloned;
    const format = await this.#objectFormat(checkout);
    if (!format.ok) return format;
    await resetRepositoryFiles(checkout, format.value);
    const branch = request.target.kind === 'task-branch' ? taskBranchName(request.taskId, sha256IdentifierDigest) : null;
    const start = await this.#start(checkout, request, branch);
    if (!start.ok) return start;
    const checkedOut = await this.#checkOut(checkout, start.value.commit, branch);
    if (!checkedOut.ok) return checkedOut;
    const head = parseCodeHeadIdentity({ repository: request.binding.repository, ...start.value });
    if (!head.ok) return head;
    const { attemptId, projectId, taskId, binding, target } = request;
    const record: WorkspaceRecord = { attemptId, kind: target.kind, branch, binding, objectFormat: format.value };
    const written = await writeWorkspaceRecord(join(staging, WORKSPACE_LAYOUT.metadata), record);
    if (!written.ok) return written;
    return ok({ attemptId, projectId, taskId, kind: target.kind, branch, head: head.value });
  }

  // The one process of a prepare that reaches the remote: it starts in
  // the neutral directory and carries the credential's header.
  async #clone(checkout: string, remote: string, credential: WorkspaceCredential): Promise<Result<void>> {
    this.#crashPoints.reach('WS1.before');
    const args = ['clone', '--no-checkout', '--quiet', '--origin', CLONE_REMOTE, '--', remote, checkout];
    const cloned = succeeded(await this.#git.run({ args, cwd: GIT_NEUTRAL_DIRECTORY, credential }), 'unavailable', 'the clone');
    if (!cloned.ok) return cloned;
    this.#crashPoints.reach('WS1.after');
    return ok(undefined);
  }

  async #objectFormat(checkout: string): Promise<Result<ObjectFormat>> {
    const output = succeeded(await this.#git.run({ args: ['rev-parse', '--show-object-format'], cwd: checkout }), 'internal', 'the object format');
    if (!output.ok) return output;
    const format = text(output.value);
    return format === 'sha1' || format === 'sha256' ? ok(format) : err(failure('internal', `unknown object format ${format}`));
  }

  // The remote task branch, else the base branch; or the given head, which
  // must be in the clone and hold the given tree.
  async #start(checkout: string, request: PrepareWorkspace, branch: string | null): Promise<Result<Start>> {
    const { target, binding } = request;
    const candidates = target.kind === 'at-head'
      ? [target.head.commit]
      : [`refs/remotes/${CLONE_REMOTE}/${branch}`, `refs/remotes/${CLONE_REMOTE}/${binding.baseBranch}`];
    for (const candidate of candidates) {
      const commit = await this.#resolve(checkout, `${candidate}^{commit}`);
      if (!commit.ok) return commit;
      if (commit.value === undefined) continue;
      const tree = await this.#treeOf(checkout, commit.value);
      if (!tree.ok) return tree;
      if (target.kind === 'at-head' && tree.value !== target.head.tree) {
        return workspaceFailure('invalid', 'head-mismatch', 'the tree is not the commit tree');
      }
      return ok({ commit: commit.value, tree: tree.value });
    }
    return err(failure('not-found', target.kind === 'at-head' ? 'the head commit is unknown' : 'the base branch is missing'));
  }

  // Undefined for a missing revision, which `--verify --quiet` reports
  // with exit code 1; any other outcome that is not success fails.
  async #resolve(checkout: string, revision: string): Promise<Result<string | undefined>> {
    const args = ['rev-parse', '--verify', '--quiet', '--end-of-options', revision];
    const output = await this.#git.run({ args, cwd: checkout });
    if (output.ok && output.value.exitCode === 1) return ok(undefined);
    const resolved = succeeded(output, 'internal', `the lookup of ${revision}`);
    return resolved.ok ? ok(text(resolved.value)) : resolved;
  }

  async #treeOf(checkout: string, commit: string): Promise<Result<string>> {
    const tree = await this.#resolve(checkout, `${commit}^{tree}`);
    if (!tree.ok) return tree;
    return tree.value === undefined ? err(failure('internal', `commit ${commit} has no tree`)) : ok(tree.value);
  }

  async #checkOut(checkout: string, commit: string, branch: string | null): Promise<Result<void>> {
    const args = branch === null ? ['checkout', '--quiet', '--detach', commit] : ['checkout', '--quiet', '--no-track', '-b', branch, commit];
    const output = succeeded(await this.#git.run({ args, cwd: checkout }), 'internal', 'the checkout');
    return output.ok ? ok(undefined) : output;
  }

  // The rename makes the workspace ready; an existing one makes it fail.
  async #placeStaging(staging: string, final: string, attemptId: AttemptId): Promise<Result<void>> {
    this.#crashPoints.reach('WS2.before');
    if (!(await attempt(rename(staging, final), ['ENOTEMPTY', 'EEXIST']))) {
      await rm(staging, { recursive: true, force: true });
      return err(failure('conflict', `workspace ${attemptId} exists`));
    }
    this.#crashPoints.reach('WS2.after');
    return syncPathAsync(this.#root);
  }

  async #deleteRemoving(removing: string): Promise<void> {
    this.#crashPoints.reach('WS4.before');
    await rm(removing, { recursive: true, force: true });
    this.#crashPoints.reach('WS4.after');
  }

  // Section 9 once per operation, before its first Git call: the
  // workspace, the hand-off, the Git directory, then the rewrite.
  async #opened(attemptId: AttemptId): Promise<Result<OpenedWorkspace>> {
    const directory = join(this.#root, workspaceDirectoryName(attemptId, sha256IdentifierDigest));
    const read = await readWorkspaceRecord(join(directory, WORKSPACE_LAYOUT.metadata));
    if (!read.ok) return read;
    const record = read.value;
    if (record === undefined) return err(failure('not-found', `no workspace ${attemptId}`));
    if (await isPresent(join(directory, WORKSPACE_LAYOUT.handOffRecord))) {
      return workspaceFailure('precondition-failed', 'workspace-handed-off', `workspace ${attemptId} is handed off`);
    }
    const checkout = join(directory, WORKSPACE_LAYOUT.checkout);
    const safe = await checkCheckoutSafety(checkout, this.#owner);
    if (!safe.ok) return safe;
    await resetRepositoryFiles(checkout, record.objectFormat);
    return ok({ record, checkout });
  }

  // The status of a workspace and the verified entries of its head tree.
  async #examine(opened: OpenedWorkspace): Promise<Result<Examined>> {
    const { record, checkout } = opened;
    const index = await this.#rebuildIndex(checkout);
    if (!index.ok) return index;
    const args = ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all', '--ignore-submodules=all'];
    const output = succeeded(await this.#git.run({ args, cwd: checkout }), 'internal', 'the status');
    if (!output.ok) return output;
    const status = parsePorcelainStatus(output.value);
    if (!status.ok) return status;
    const { commit, branch } = status.value;
    if (commit === null) return err(failure('internal', 'the workspace has no head commit'));
    const tree = await readHeadTree(this.#objectRead(checkout), record.objectFormat, commit);
    if (!tree.ok) return tree;
    const head = parseCodeHeadIdentity({ repository: record.binding.repository, commit, tree: tree.value.tree });
    if (!head.ok) return head;
    const matches = indexMatchesTree(index.value, tree.value.entries);
    const dirtyReasons = await this.#dirtyReasons(record, checkout, status.value, matches);
    return ok({ status: { head: head.value, branch, dirtyReasons }, entries: tree.value.entries });
  }

  // Writes every index entry anew, without its stat data, flags, or cache
  // tree, any of which the agent can forge to hide a change (section 6).
  async #rebuildIndex(checkout: string): Promise<Result<readonly IndexEntry[]>> {
    const listed = succeeded(await this.#git.run({ args: ['ls-files', '--stage', '-z'], cwd: checkout }), 'internal', 'the index listing');
    if (!listed.ok) return listed;
    const entries = parseIndexEntries(listed.value);
    if (!entries.ok || entries.value.length === 0) return entries;
    const input = indexInfo(entries.value);
    const rebuilt = succeeded(await this.#git.run({ args: ['update-index', '-z', '--index-info'], cwd: checkout, input }), 'internal', 'the index rebuild');
    return rebuilt.ok ? entries : rebuilt;
  }

  async #dirtyReasons(record: WorkspaceRecord, checkout: string, status: PorcelainStatus, indexMatches: boolean): Promise<DirtyReason[]> {
    const kinds = new Set(status.entries.map(({ kind }) => kind));
    const markers = await Promise.all(OPERATION_MARKERS.map((marker) => isPresent(join(checkout, '.git', marker))));
    const reasons = new Set<DirtyReason>();
    if (kinds.has('changed') || kinds.has('renamed') || !indexMatches) reasons.add('modified');
    if (kinds.has('untracked')) reasons.add('untracked');
    if (kinds.has('unmerged') || markers.includes(true)) reasons.add('operation-in-progress');
    if (record.kind === 'task-branch' && status.branch !== record.branch) reasons.add('off-branch');
    return DIRTY_REASONS.filter((reason) => reasons.has(reason));
  }

  // The snapshot's tree from verified blobs (decision Q1 b), never from
  // `git archive`.
  async #snapshotTree({ record, checkout }: OpenedWorkspace, entries: readonly ListedEntry[]): Promise<Result<ReadonlyMap<string, GitTreeEntry>>> {
    const names = [...new Set(entries.flatMap((entry) => (entry.type === 'blob' ? [entry.object] : [])))];
    const blobs = await readVerified(this.#objectRead(checkout), record.objectFormat, 'blob', names);
    return blobs.ok ? snapshotTree(entries, blobs.value) : blobs;
  }

  #objectRead(checkout: string): ObjectRead {
    return async (type: GitObjectType, names: readonly string[]) => {
      if (names.length === 0) return ok(new Map());
      const input = new TextEncoder().encode(`${names.join('\n')}\n`);
      const output = succeeded(await this.#git.run({ args: ['cat-file', '--batch'], cwd: checkout, input }), 'internal', 'the object read');
      return output.ok ? parseBatchObjects(output.value, names, type) : output;
    };
  }
}
