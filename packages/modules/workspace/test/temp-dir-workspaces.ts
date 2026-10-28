import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { appendFile, chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import {
  DIRTY_REASONS,
  GIT_CLIENT_PINS,
  HEAD_SNAPSHOT_CONTENT_TYPE,
  TASK_BRANCH_PREFIX,
  WORKSPACE_LAYOUT,
  WORKSPACE_MODES,
  checkCredentialScope,
  checkRemoteTransport,
  cleanHead,
  encodeHeadSnapshot,
  parseCodeHeadIdentity,
  parseGitObjectId,
  taskBranchName,
  taskBranchPushOptions,
  workspaceDirectoryName,
  workspaceFailure,
  type CodeHeadIdentity,
  type DirtyReason,
  type GitObjectId,
  type GitProcessObservation,
  type GitTreeEntry,
  type HeadSnapshot,
  type IdentifierDigest,
  type PrepareWorkspace,
  type PushTaskBranch,
  type RemoteAccess,
  type RemoteHeadRequest,
  type RepositoryBinding,
  type RepositoryId,
  type TreeEntry,
  type Workspace,
  type WorkspaceCredential,
  type WorkspaceFixture,
  type WorkspaceKind,
  type WorkspaceProvider,
  type WorkspaceStatus,
} from '@taskelith/workspace';

// A test-only provider: real directories under a temporary data root and
// a fake Git service whose objects are content-addressed trees.

type Tree = Readonly<Record<string, GitTreeEntry>>;

// An entry as JSON can hold it: file bytes in base64, so nothing is lost.
type StoredEntry =
  | { readonly type: 'file'; readonly mode: '100644' | '100755'; readonly content: string }
  | Exclude<GitTreeEntry, { readonly type: 'file' }>;

type StoredTree = Readonly<Record<string, StoredEntry>>;

function store(entry: GitTreeEntry): StoredEntry {
  return entry.type === 'file' ? { ...entry, content: Buffer.from(entry.content).toString('base64') } : entry;
}

function load(entry: StoredEntry): GitTreeEntry {
  return entry.type === 'file' ? { ...entry, content: new Uint8Array(Buffer.from(entry.content, 'base64')) } : entry;
}

const storeTree = (tree: Tree): StoredTree => Object.fromEntries(Object.entries(tree).map(([path, entry]) => [path, store(entry)]));
const loadTree = (tree: StoredTree): Tree => Object.fromEntries(Object.entries(tree).map(([path, entry]) => [path, load(entry)]));

interface Commit {
  readonly tree: string;
  readonly parent: string | null;
  readonly entries: Tree;
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');
const canonical = (tree: Tree) => JSON.stringify(Object.keys(tree).sort().map((path) => [path, store(tree[path]!)]));
const bytes = (text: string) => new TextEncoder().encode(text);
const file = (content: Uint8Array): TreeEntry => ({ type: 'file', mode: '100644', content });
const textFile = (text: string) => file(bytes(text));

export class FakeGitService {
  readonly commits = new Map<string, Commit>();
  readonly branches = new Map<string, string>();
  // The Git processes an adapter would have started, as the fixture sees them.
  readonly processes: GitProcessObservation[] = [];
  calls = 0;
  #sequence = 0;

  constructor(baseBranch: string, baseTree: Tree) {
    this.branches.set(baseBranch, this.commit(baseTree, null));
  }

  commit(entries: Tree, parent: string | null): string {
    this.#sequence += 1;
    const tree = sha1(canonical(entries));
    const id = sha1(JSON.stringify({ tree, parent, sequence: this.#sequence }));
    this.commits.set(id, { tree, parent, entries });
    return id;
  }

  entries(commit: string): Tree {
    return this.commits.get(commit)?.entries ?? {};
  }

  // A new clone reaches only commits that a remote branch holds.
  published(commit: string): boolean {
    return [...this.branches.values()].some((head) => this.descends(head, commit));
  }

  descends(commit: string, ancestor: string): boolean {
    for (let current: string | null = commit; current !== null; current = this.commits.get(current)?.parent ?? null) {
      if (current === ancestor) return true;
    }
    return false;
  }
}

// What the double keeps in the checkout's `.git`; a real adapter uses Git.
// The agent can change it, so nothing in it decides what may be pushed.
interface LocalState {
  readonly branch: string | null;
  readonly commit: string;
  // The index: what the next commit would hold.
  readonly index: StoredTree;
}

// The worker's record beside the checkout, closed to the execution.
interface Metadata {
  readonly attemptId: AttemptId;
  readonly kind: WorkspaceKind;
  readonly expectedBranch: string | null;
  readonly remote: string;
}

// The safe form that names had to have before they were derived.
const PRE_DERIVATION_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// A safe and distinct name that is not the derived one.
const percentEncoded = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, (character) => `%${character.charCodeAt(0).toString(16)}`);

const sha256Digest: IdentifierDigest = (identifier) => createHash('sha256').update(identifier, 'utf8').digest('hex');

// The digest the composition supplies, or a defective one that a wrong
// adapter would use consistently for its names and its fixture.
function identifierDigest(defects: DoubleDefects): IdentifierDigest {
  if (defects.digestsWithSha1) return sha1;
  if (defects.digestsLatin1Bytes) return (identifier) => createHash('sha256').update(identifier, 'latin1').digest('hex');
  return sha256Digest;
}

const STATE_FILE = join('.git', 'state.json');
const GIT_CONFIG_FILE = join('.git', 'config');
const FIRST_PROCESS_ID = 1000;
// A submodule commit that the fake service never holds.
const UNKNOWN_SUBMODULE_COMMIT = 'f'.repeat(40);
const OPERATION_FILE = join('.git', 'operation');
// What the double writes as `.git/config` before each Git call.
const REPOSITORY_CONFIG = '[core]\n\trepositoryformatversion = 0\n';
// Command-scope settings of every Git call (contract section 7).
const COMMAND_SCOPE_SETTINGS = [
  'core.hooksPath', 'credential.helper', 'diff.ignoreSubmodules', 'status.submoduleSummary',
  'submodule.recurse', 'fetch.recurseSubmodules', 'push.recurseSubmodules',
];
const BUILT_ENVIRONMENT = ['PATH', 'HOME', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_TERMINAL_PROMPT'];
const INHERITED_ENVIRONMENT = ['PATH', 'HOME', 'SUDO_UID', 'GIT_CONFIG_PARAMETERS', 'GIT_TRACE'];

// The environment's names: the credential's header is one more setting.
function gitEnvironmentKeys(withCredential: boolean): string[] {
  const settings = COMMAND_SCOPE_SETTINGS.length + (withCredential ? 1 : 0);
  const pairs = Array.from({ length: settings }, (_, index) => [`GIT_CONFIG_KEY_${index}`, `GIT_CONFIG_VALUE_${index}`]);
  return [...BUILT_ENVIRONMENT, 'GIT_CONFIG_COUNT', ...pairs.flat()];
}

export interface DoubleDefects {
  readonly storesSecret?: boolean;
  readonly ignoresUntracked?: boolean;
  readonly removesWorkspacesRoot?: boolean;
  readonly callsRemoteBeforeScope?: boolean;
  readonly callsRemoteBeforeScopeInPrepare?: boolean;
  readonly snapshotsStaleTree?: boolean;
  readonly removesDirty?: boolean;
  readonly acceptsMismatchedTree?: boolean;
  readonly namesBranchByRawTaskId?: boolean;
  readonly namesDirectoryByEncoding?: boolean;
  readonly digestsWithSha1?: boolean;
  readonly digestsLatin1Bytes?: boolean;
  readonly removesDigestOnlyNameWithDash?: boolean;
  readonly rejectsUnsafeNames?: boolean;
  readonly snapshotsCommit?: boolean;
  readonly snapshotsWithoutMetadata?: boolean;
  readonly sweepFollowsLinks?: boolean;
  readonly ignoresIndex?: boolean;
  readonly corruptsBinary?: boolean;
  readonly ignoresHandOff?: boolean;
  readonly keepsOutsideLinks?: boolean;
  readonly followsGitLinks?: boolean;
  readonly handsOffBeyondOne?: boolean;
  readonly racesHandOff?: boolean;
  readonly ignoresLease?: boolean;
  readonly ignoresAncestry?: boolean;
  readonly pushesWithBareLease?: boolean;
  readonly forgetsHandOffsOnRestart?: boolean;
  readonly passesSecretInArguments?: boolean;
  readonly inheritsEnvironment?: boolean;
  readonly keepsPlantedSettings?: boolean;
  readonly snapshotsGitlink?: boolean;
  readonly acceptsInsecureRemote?: boolean;
  readonly refusesEveryPrepare?: boolean;
}

// One chain of hand-offs per workspace root, so that a hand-off checks
// for another and writes its record before the next one checks.
const handOffChains = new Map<string, Promise<unknown>>();

function inHandOffChain<T>(root: string, work: () => Promise<T>): Promise<T> {
  const run = (handOffChains.get(root) ?? Promise.resolve()).then(work, work);
  const release = () => {
    if (handOffChains.get(root) === run) handOffChains.delete(root);
  };
  handOffChains.set(root, run);
  void run.then(release, release);
  return run;
}

// Holds each racing hand-off after its check until every hand-off in
// flight has checked, so that none sees the record of another.
export class CheckBarrier {
  private inFlight = 0;
  private readonly held: (() => void)[] = [];

  // Counts the caller before its first await, as concurrent calls need.
  async afterAllChecks<T>(check: () => Promise<T>): Promise<T> {
    this.inFlight += 1;
    let checked: T;
    try {
      checked = await check();
    } catch (error) {
      this.leave();
      throw error;
    }
    await this.arrive();
    return checked;
  }

  private leave(): void {
    this.inFlight -= 1;
    if (this.inFlight === 0) for (const release of this.held.splice(0)) release();
  }

  private arrive(): Promise<void> {
    this.leave();
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise((release) => this.held.push(release));
  }
}

export class TempDirWorkspaces implements WorkspaceProvider {
  readonly root: string;
  readonly service: FakeGitService;
  readonly repository: RepositoryId;
  readonly digest: IdentifierDigest;
  readonly defects: DoubleDefects;
  private readonly racingChecks = new CheckBarrier();
  // The defective hand-off state that lives only as long as the provider.
  private readonly handedOffInMemory = new Set<AttemptId>();

  constructor(dataRoot: string, service: FakeGitService, repository: RepositoryId, digest: IdentifierDigest, defects: DoubleDefects = {}) {
    this.root = join(dataRoot, WORKSPACE_LAYOUT.root);
    this.service = service;
    this.repository = repository;
    this.digest = digest;
    this.defects = defects;
  }

  async prepare(request: PrepareWorkspace): Promise<Result<Workspace>> {
    if (this.defects.refusesEveryPrepare) return err(failure('unavailable', 'the remote cannot be reached'));
    if (this.defects.rejectsUnsafeNames && ![request.attemptId, request.taskId].every((text) => PRE_DERIVATION_NAME.test(text))) {
      return err(failure('invalid', 'the identifier is not a safe name'));
    }
    const name = this.directoryName(request.attemptId);
    const { target } = request;
    const taskBranch = this.defects.namesBranchByRawTaskId ? `${TASK_BRANCH_PREFIX}${request.taskId}` : taskBranchName(request.taskId, this.digest);
    if (target.kind === 'at-head' && target.head.repository !== request.binding.repository) {
      return err(failure('invalid', 'the head belongs to another repository'));
    }
    const transport = checkRemoteTransport(request.binding.remote, 'https-only');
    if (!transport.ok && !this.defects.acceptsInsecureRemote) return transport;
    if (this.defects.callsRemoteBeforeScopeInPrepare) this.service.calls += 1;
    const scope = this.scope(request.credential, request.binding.repository, 'read-code');
    if (!scope.ok) return scope;
    this.runGit(['ls-remote', request.binding.remote], request.credential);
    const commit = this.startCommit(request, taskBranch);
    if (commit === undefined) return err(failure('not-found', 'the base branch or the head is unknown'));
    if (target.kind === 'at-head' && this.service.commits.get(commit)?.tree !== target.head.tree && !this.defects.acceptsMismatchedTree) {
      return workspaceFailure('invalid', 'head-mismatch', 'the tree is not the commit tree');
    }
    const final = join(this.root, name);
    if (await exists(final)) return err(failure('conflict', `workspace ${request.attemptId} exists`));
    const branch = target.kind === 'task-branch' ? taskBranch : null;
    const secret = this.defects.storesSecret ? `https://${request.credential.secret}@` : '';
    const remote = `${secret}${request.binding.remote}`;
    const index = storeTree(this.service.entries(commit));
    const staging = join(this.root, `${WORKSPACE_LAYOUT.stagingPrefix}${name}`);
    await mkdir(staging, { mode: WORKSPACE_MODES.attempt });
    await chmod(staging, WORKSPACE_MODES.attempt);
    const metadata: Metadata = { attemptId: request.attemptId, kind: target.kind, expectedBranch: branch, remote };
    await writeFile(join(staging, WORKSPACE_LAYOUT.metadata), JSON.stringify(metadata), { mode: WORKSPACE_MODES.metadata });
    this.runGit(['clone', '--no-checkout', remote, join(staging, WORKSPACE_LAYOUT.checkout)], request.credential);
    await this.checkout(join(staging, WORKSPACE_LAYOUT.checkout), { branch, commit, index });
    await rename(staging, final);
    return ok({
      attemptId: request.attemptId, projectId: request.projectId, taskId: request.taskId, kind: target.kind,
      branch, workingDirectory: join(final, WORKSPACE_LAYOUT.checkout), head: this.head(commit),
    });
  }

  // The attempt comes from the record, as a name does not hold it whole.
  async list(): Promise<readonly AttemptId[]> {
    const names = (await readdir(this.root)).filter((entry) => !entry.startsWith('.'));
    const records = await Promise.all(names.map((entry) => readMetadata(join(this.root, entry, WORKSPACE_LAYOUT.checkout))));
    return records.map((record) => record.attemptId).sort();
  }

  async remove(attemptId: AttemptId): Promise<Result<void>> {
    const target = join(this.root, this.removalName(attemptId));
    if (!(await exists(target))) return ok(undefined);
    const current = await this.inspect(attemptId);
    if (!current.ok) return current;
    const clean = cleanHead(current.value);
    if (!clean.ok && !this.defects.removesDirty) return clean;
    if (this.defects.removesWorkspacesRoot) {
      await rm(this.root, { recursive: true });
      await mkdir(this.root);
      return ok(undefined);
    }
    const removing = join(this.root, `${WORKSPACE_LAYOUT.removingPrefix}${this.directoryName(attemptId)}`);
    await rename(target, removing);
    await rm(removing, { recursive: true });
    return ok(undefined);
  }

  async handedOff(): Promise<readonly AttemptId[]> {
    const listed = await this.list();
    if (this.defects.forgetsHandOffsOnRestart) return listed.filter((attemptId) => this.handedOffInMemory.has(attemptId));
    const records = await Promise.all(listed.map((attemptId) => exists(this.handOffRecordOf(attemptId))));
    return listed.filter((_, index) => records[index]);
  }

  private handOffRecordOf(attemptId: AttemptId): string {
    return join(this.root, this.directoryName(attemptId), WORKSPACE_LAYOUT.handOffRecord);
  }

  async sweep(): Promise<void> {
    for (const entry of await readdir(this.root)) {
      if (!entry.startsWith(WORKSPACE_LAYOUT.stagingPrefix) && !entry.startsWith(WORKSPACE_LAYOUT.removingPrefix)) continue;
      const path = join(this.root, entry);
      if (this.defects.sweepFollowsLinks) await rm(await realpath(path), { recursive: true });
      await rm(path, { recursive: true, force: true });
    }
  }

  async handOff(attemptId: AttemptId): Promise<Result<void>> {
    if (this.defects.racesHandOff) return this.racingHandOff(attemptId);
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    const handedOff = await inHandOffChain(this.root, () => this.handOffAlone(attemptId, checkout.value));
    if (handedOff.ok) this.handedOffInMemory.add(attemptId);
    return handedOff;
  }

  private async handOffAlone(attemptId: AttemptId, checkout: string): Promise<Result<void>> {
    if (await this.mustWait(attemptId)) return otherWorkspaceHandedOff();
    return markHandedOff(checkout);
  }

  private async racingHandOff(attemptId: AttemptId): Promise<Result<void>> {
    const checked = await this.racingChecks.afterAllChecks(() => this.handOffCheck(attemptId));
    if (!checked.ok) return checked;
    const { checkout, mustWait } = checked.value;
    return mustWait ? otherWorkspaceHandedOff() : markHandedOff(checkout);
  }

  private async handOffCheck(attemptId: AttemptId): Promise<Result<{ checkout: string; mustWait: boolean }>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    return ok({ checkout: checkout.value, mustWait: await this.mustWait(attemptId) });
  }

  private async mustWait(attemptId: AttemptId): Promise<boolean> {
    return !this.defects.handsOffBeyondOne && this.handedOffElsewhere(attemptId);
  }

  // The double models a worker whose executions share a separate account.
  private async handedOffElsewhere(attemptId: AttemptId): Promise<boolean> {
    const others = (await this.list()).filter((other) => other !== attemptId);
    const records = others.map((other) => exists(this.handOffRecordOf(other)));
    return (await Promise.all(records)).includes(true);
  }

  // A real adapter runs the copy and the grant as the execution account.
  async reclaim(attemptId: AttemptId): Promise<Result<void>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    if (!(await handedOff(checkout.value))) return ok(undefined);
    await normalize(checkout.value, !this.defects.keepsOutsideLinks);
    await chmod(checkout.value, WORKSPACE_MODES.checkoutReclaimed);
    await rm(handOffRecord(checkout.value));
    this.handedOffInMemory.delete(attemptId);
    return ok(undefined);
  }

  // The checkout, if the worker may run Git in it now.
  private async reclaimedCheckout(attemptId: AttemptId): Promise<Result<string>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    if (!this.defects.ignoresHandOff && (await handedOff(checkout.value))) {
      return workspaceFailure('precondition-failed', 'workspace-handed-off', `workspace ${attemptId} is handed off`);
    }
    if (await this.unsafeGitDirectory(checkout.value)) {
      return workspaceFailure('precondition-failed', 'unsafe-checkout', `the Git directory of ${attemptId} is not safe`);
    }
    if (!this.defects.keepsPlantedSettings) await writeRepositoryConfig(checkout.value);
    return checkout;
  }

  // A `.git` that is missing, no directory, holds a link or redirection, or
  // has another `.git` below the top, such as a submodule's gitfile.
  private async unsafeGitDirectory(checkout: string): Promise<boolean> {
    const gitDirectory = join(checkout, '.git');
    const status = await lstat(gitDirectory).catch(() => undefined);
    if (status === undefined || !status.isDirectory()) return true;
    if (this.defects.followsGitLinks) return false;
    return (await holdsRedirection(gitDirectory)) || holdsNestedGitEntry(checkout);
  }

  async inspect(attemptId: AttemptId): Promise<Result<WorkspaceStatus>> {
    const checkout = await this.reclaimedCheckout(attemptId);
    if (!checkout.ok) return checkout;
    const state = await readState(checkout.value);
    const { expectedBranch } = await readMetadata(checkout.value);
    this.runGit(['status', '--porcelain=v2', '--ignore-submodules=all']);
    const committed = this.service.entries(state.commit);
    const working = await workingTree(checkout.value);
    const ignored = ignoredPaths(committed);
    const reasons = new Set<DirtyReason>();
    for (const [path, entry] of Object.entries(committed)) {
      if (!(await holdsEntry(checkout.value, working, path, entry))) reasons.add('modified');
    }
    if (!this.defects.ignoresIndex && !sameTree(loadTree(state.index), committed)) reasons.add('modified');
    const untracked = Object.keys(working).some((path) => !(path in committed) && !ignored.has(path));
    if (untracked && !this.defects.ignoresUntracked) reasons.add('untracked');
    if (await exists(join(checkout.value, OPERATION_FILE))) reasons.add('operation-in-progress');
    if (state.branch !== expectedBranch) reasons.add('off-branch');
    const dirtyReasons = DIRTY_REASONS.filter((reason) => reasons.has(reason));
    return ok({ head: this.head(state.commit), branch: state.branch, dirtyReasons });
  }

  async snapshot(attemptId: AttemptId): Promise<Result<HeadSnapshot>> {
    const current = await this.inspect(attemptId);
    if (!current.ok) return current;
    const head = cleanHead(current.value);
    if (!head.ok) return head;
    this.runGit(['ls-tree', '-r', '-z', '--full-tree', head.value.commit]);
    const content = encodeHeadSnapshot(this.snapshotEntries(head.value.commit));
    if (!content.ok) return content;
    const reported = this.defects.snapshotsStaleTree ? this.staleHead(head.value) : head.value;
    return ok({ head: reported, contentType: HEAD_SNAPSHOT_CONTENT_TYPE, content: content.value });
  }

  // The commit's entries, as each snapshot defect alters them.
  private snapshotEntries(commit: string): Tree {
    let entries = Object.entries(this.service.entries(commit));
    if (this.defects.snapshotsGitlink) entries = entries.filter(([, entry]) => entry.type !== 'gitlink');
    if (this.defects.snapshotsWithoutMetadata) {
      const plain = (entry: GitTreeEntry) => (entry.type === 'file' ? file(entry.content) : entry.type === 'link' ? textFile(entry.target) : entry);
      entries = entries.map(([path, entry]) => [path, plain(entry)]);
    }
    if (this.defects.corruptsBinary) {
      const lossy = (entry: GitTreeEntry) => (entry.type === 'file' ? { ...entry, content: bytes(new TextDecoder().decode(entry.content)) } : entry);
      entries = entries.map(([path, entry]) => [path, lossy(entry)]);
    }
    if (this.defects.snapshotsCommit) entries = [...entries, ['COMMIT', textFile(commit)]];
    return Object.fromEntries(entries);
  }

  // The head with its parent's tree, as a cache that missed a commit would.
  private staleHead(head: CodeHeadIdentity): CodeHeadIdentity {
    const parent = this.service.commits.get(head.commit)?.parent ?? head.commit;
    const tree = this.service.commits.get(parent)?.tree ?? head.tree;
    return mustParse(parseCodeHeadIdentity({ repository: head.repository, commit: head.commit, tree }));
  }

  async readRemoteHead(request: RemoteHeadRequest): Promise<Result<GitObjectId | null>> {
    const opened = await this.taskBranchOf(request.attemptId, request.credential, 'read-code');
    if (!opened.ok) return opened;
    this.lsRemote(opened.value, request.credential);
    const remote = this.service.branches.get(opened.value.branch);
    return remote === undefined ? ok(null) : parseGitObjectId(remote);
  }

  async push(request: PushTaskBranch): Promise<Result<CodeHeadIdentity>> {
    const opened = await this.taskBranchOf(request.attemptId, request.credential, 'write-code');
    if (!opened.ok) return opened;
    const current = await this.inspect(request.attemptId);
    if (!current.ok) return current;
    const head = cleanHead(current.value);
    if (!head.ok) return head;
    const { branch, remote: url } = opened.value;
    this.lsRemote(opened.value, request.credential);
    const remote = this.service.branches.get(branch) ?? null;
    if (remote !== request.expectedRemoteHead && !this.defects.ignoresLease) {
      return workspaceFailure('conflict', 'remote-moved', 'the remote task branch moved');
    }
    if (remote !== null && !this.service.descends(head.value.commit, remote) && !this.defects.ignoresAncestry) {
      return workspaceFailure('conflict', 'not-fast-forward', 'the push is not a fast-forward');
    }
    const lease = this.defects.pushesWithBareLease ? ['--atomic', '--force-with-lease'] : taskBranchPushOptions(branch, request.expectedRemoteHead);
    this.runGit(['push', ...lease, url, `HEAD:refs/heads/${branch}`], request.credential);
    this.service.branches.set(branch, head.value.commit);
    return head;
  }

  private lsRemote({ branch, remote }: { branch: string; remote: string }, credential: WorkspaceCredential): void {
    this.runGit(['ls-remote', remote, `refs/heads/${branch}`], credential);
  }

  // Records the Git process a real adapter would start; one that reaches
  // the remote gets the credential's header in its environment only.
  private runGit(args: readonly string[], credential?: WorkspaceCredential): void {
    if (credential !== undefined) this.service.calls += 1;
    const header = credential !== undefined && this.defects.passesSecretInArguments ? ['-c', `http.extraHeader=${credential.secret}`] : [];
    const environmentKeys = this.defects.inheritsEnvironment ? INHERITED_ENVIRONMENT : gitEnvironmentKeys(credential !== undefined);
    const pid = this.service.processes.length + FIRST_PROCESS_ID;
    this.service.processes.push({ argv: [GIT_CLIENT_PINS.linux.path, ...header, ...args], pid, environmentKeys });
  }

  directoryName(attemptId: AttemptId): string {
    return this.defects.namesDirectoryByEncoding ? percentEncoded(attemptId) : workspaceDirectoryName(attemptId, this.digest);
  }

  // The defect writes a digest-only name as an empty prefix and a `-`.
  private removalName(attemptId: AttemptId): string {
    const name = this.directoryName(attemptId);
    return this.defects.removesDigestOnlyNameWithDash && !name.includes('-') ? `-${name}` : name;
  }

  async checkoutOf(attemptId: AttemptId): Promise<Result<string>> {
    const checkout = join(this.root, this.directoryName(attemptId), WORKSPACE_LAYOUT.checkout);
    return (await exists(checkout)) ? ok(checkout) : err(failure('not-found', `no workspace ${attemptId}`));
  }

  private async taskBranchOf(attemptId: AttemptId, credential: WorkspaceCredential, access: RemoteAccess): Promise<Result<{ branch: string; remote: string }>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    const { expectedBranch, remote } = await readMetadata(checkout.value);
    if (expectedBranch === null) return workspaceFailure('invalid', 'read-only-workspace', 'an at-head workspace has no task branch');
    const scope = this.scope(credential, this.repository, access);
    return scope.ok ? ok({ branch: expectedBranch, remote }) : scope;
  }

  private scope(credential: WorkspaceCredential, repository: RepositoryId, access: RemoteAccess): Result<void> {
    if (this.defects.callsRemoteBeforeScope) this.service.calls += 1;
    return checkCredentialScope(credential, repository, access);
  }

  private head(commit: string): CodeHeadIdentity {
    const tree = this.service.commits.get(commit)?.tree ?? '';
    return mustParse(parseCodeHeadIdentity({ repository: this.repository, commit, tree }));
  }

  private startCommit(request: PrepareWorkspace, taskBranch: string): string | undefined {
    if (request.target.kind === 'at-head') {
      const { commit } = request.target.head;
      return this.service.commits.has(commit) && this.service.published(commit) ? commit : undefined;
    }
    if (!this.service.branches.has(request.binding.baseBranch)) return undefined;
    return this.service.branches.get(taskBranch) ?? this.service.branches.get(request.binding.baseBranch);
  }

  private async checkout(directory: string, state: LocalState): Promise<void> {
    await mkdir(directory, { mode: WORKSPACE_MODES.checkoutReclaimed });
    await chmod(directory, WORKSPACE_MODES.checkoutReclaimed);
    await mkdir(join(directory, '.git'));
    await writeRepositoryConfig(directory);
    for (const [path, entry] of Object.entries(this.service.entries(state.commit))) await writeEntry(join(directory, path), entry);
    await writeState(directory, state);
  }
}

function mustParse<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, () => false);
}

// A gitlink's working tree entry is a directory, as Git leaves it.
async function holdsEntry(checkout: string, working: Tree, path: string, entry: GitTreeEntry): Promise<boolean> {
  if (entry.type === 'gitlink') return (await lstat(join(checkout, path)).catch(() => undefined))?.isDirectory() === true;
  const held = working[path];
  return held !== undefined && JSON.stringify(store(held)) === JSON.stringify(store(entry));
}

async function writeRepositoryConfig(checkout: string): Promise<void> {
  await writeFile(join(checkout, GIT_CONFIG_FILE), REPOSITORY_CONFIG);
}

function sameTree(left: Tree, right: Tree): boolean {
  return canonical(left) === canonical(right);
}

function ignoredPaths(tree: Tree): Set<string> {
  const rules = tree['.gitignore'];
  return new Set(rules?.type === 'file' ? new TextDecoder().decode(rules.content).split('\n').filter(Boolean) : []);
}

async function writeEntry(path: string, entry: GitTreeEntry): Promise<void> {
  if (entry.type === 'gitlink') return void (await mkdir(path, { recursive: true }));
  if (entry.type === 'link') return symlink(entry.target, path);
  await writeFile(path, entry.content);
  await chmod(path, entry.mode === '100755' ? 0o755 : 0o644);
}

async function readMetadata(checkout: string): Promise<Metadata> {
  return JSON.parse(await readFile(join(dirname(checkout), WORKSPACE_LAYOUT.metadata), 'utf8')) as Metadata;
}

function handOffRecord(checkout: string): string {
  return join(dirname(checkout), WORKSPACE_LAYOUT.handOffRecord);
}

async function handedOff(checkout: string): Promise<boolean> {
  return exists(handOffRecord(checkout));
}

// The record first, so the state survives where no mode changes.
async function markHandedOff(checkout: string): Promise<Result<void>> {
  await writeFile(handOffRecord(checkout), '', { mode: WORKSPACE_MODES.handOffRecord });
  await chmod(checkout, WORKSPACE_MODES.checkoutHandedOff);
  return ok(undefined);
}

function otherWorkspaceHandedOff(): Result<void> {
  return workspaceFailure('precondition-failed', 'other-workspace-handed-off', 'another workspace is handed off');
}

async function holdsRedirection(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === 'commondir' || entry.name === 'alternates') return true;
    if (entry.isDirectory() && (await holdsRedirection(join(directory, entry.name)))) return true;
  }
  return false;
}

async function holdsNestedGitEntry(checkout: string): Promise<boolean> {
  for (const entry of await readdir(checkout, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.git') continue;
    if (await holdsGitEntry(join(checkout, entry.name))) return true;
  }
  return false;
}

async function holdsGitEntry(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') return true;
    if (entry.isDirectory() && (await holdsGitEntry(join(directory, entry.name)))) return true;
  }
  return false;
}

// Copies every regular file with another hard link and sets exact shared
// modes on each entry, never following a link or opening a special file.
async function normalize(directory: string, copiesLinked: boolean): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await chmod(path, 0o2770);
      await normalize(path, copiesLinked);
      continue;
    }
    const status = await lstat(path);
    const mode = sharedMode(status.mode);
    await chmod(path, mode);
    if (copiesLinked && status.isFile() && status.nlink > 1) await replaceWithCopy(path, mode);
  }
}

// Read and write for the owner and the group, executable if it was.
function sharedMode(mode: number): number {
  return (mode & 0o111) === 0 ? 0o660 : 0o770;
}

// The copy gets a fresh name, created exclusively, so no entry of the agent
// is written through or replaced; the source is read without a link.
async function replaceWithCopy(path: string, mode: number): Promise<void> {
  const source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const content = await source.readFile().finally(() => source.close());
  const copyPath = join(dirname(path), `.reclaim-${randomBytes(8).toString('hex')}`);
  const copy = await open(copyPath, 'wx', mode);
  try {
    await copy.writeFile(content);
    await copy.chmod(mode);
  } finally {
    await copy.close();
  }
  await rename(copyPath, path);
}

async function readState(checkout: string): Promise<LocalState> {
  return JSON.parse(await readFile(join(checkout, STATE_FILE), 'utf8')) as LocalState;
}

async function writeState(checkout: string, state: LocalState): Promise<void> {
  await writeFile(join(checkout, STATE_FILE), JSON.stringify(state));
}

// The working tree outside `.git`; a link is read, never followed.
async function workingTree(checkout: string, prefix = ''): Promise<Record<string, TreeEntry>> {
  const tree: Record<string, TreeEntry> = {};
  for (const entry of await readdir(join(checkout, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const full = join(checkout, path);
    if (path === '.git') continue;
    if (entry.isDirectory()) Object.assign(tree, await workingTree(checkout, path));
    else if (entry.isSymbolicLink()) tree[path] = { type: 'link', target: await readlink(full) };
    else {
      const mode = ((await lstat(full)).mode & 0o111) === 0 ? '100644' : '100755';
      tree[path] = { type: 'file', mode, content: new Uint8Array(await readFile(full)) };
    }
  }
  return tree;
}

async function allText(directory: string): Promise<string> {
  const parts: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await allText(path));
    else if (entry.isFile()) parts.push(`${path}\n${await readFile(path, 'utf8')}`);
  }
  return parts.sort().join('\n');
}

async function recordText(path: string): Promise<string> {
  return (await lstat(path)).isDirectory() ? allText(path) : `${path}\n${await readFile(path, 'utf8')}`;
}

// Reads the files and links of a ustar archive with pax path records.
function decodeTar(archive: Uint8Array): Record<string, TreeEntry> {
  const tree: Record<string, TreeEntry> = {};
  const text = (from: number, length: number) => new TextDecoder().decode(archive.subarray(from, from + length)).replace(/\0.*$/s, '');
  let pax: Record<string, string> = {};
  for (let offset = 0; offset + 512 <= archive.length && archive[offset] !== 0;) {
    const size = Number.parseInt(text(offset + 124, 12), 8);
    const type = text(offset + 156, 1);
    const data = archive.subarray(offset + 512, offset + 512 + size);
    if (type === 'x') pax = paxRecords(new TextDecoder().decode(data));
    else {
      const path = pax.path ?? text(offset, 100);
      const executable = (Number.parseInt(text(offset + 100, 8), 8) & 0o111) !== 0;
      tree[path] = type === '2'
        ? { type: 'link', target: pax.linkpath ?? text(offset + 157, 100) }
        : { type: 'file', mode: executable ? '100755' : '100644', content: new Uint8Array(data) };
      pax = {};
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return tree;
}

function paxRecords(records: string): Record<string, string> {
  const pairs = records.split('\n').filter(Boolean).map((record) => record.slice(record.indexOf(' ') + 1).split(/=(.*)/s));
  return Object.fromEntries(pairs.map(([key, value]) => [key, value ?? '']));
}

const BASE_BRANCH = 'main';
const TRACKED = 'README.md';
const IGNORED = 'build.log';
const BASE_TREE: Readonly<Record<string, TreeEntry>> = { [TRACKED]: textFile('base\n'), '.gitignore': textFile(`${IGNORED}\n`) };

// Every record kind of the worker journal contract section 2.
const CONTROL_RECORDS: Readonly<Record<string, string>> = {
  'worker/identity': 'identity',
  'worker/lock': '',
  'worker/journal/journal.sqlite': 'journal',
  'worker/journal-fault': 'fault',
  'worker/credentials/control-plane.1': 'credential',
  'worker/executions/execution-1/intent': 'intent',
  'worker/logs/stream.log': 'log',
};

function credential(credentialId: string, repositories: string[], permissions: string[]): WorkspaceCredential {
  return { credentialId, secret: `secret-of-${credentialId}`, repositories, permissions };
}

// A fresh data root with control records, a service, and the fixture.
export async function createFixture(defects: DoubleDefects = {}): Promise<{ fixture: WorkspaceFixture; dispose: () => Promise<void> }> {
  const dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'taskelith-workspace-')));
  for (const [path, text] of Object.entries(CONTROL_RECORDS)) {
    await mkdir(dirname(join(dataRoot, path)), { recursive: true });
    await writeFile(join(dataRoot, path), text);
  }
  await mkdir(join(dataRoot, WORKSPACE_LAYOUT.root), { recursive: true });
  const service = new FakeGitService(BASE_BRANCH, BASE_TREE);
  const repository = mustParse(parseIdentifier('RepositoryId', 'acme/project')) as RepositoryId;
  const digest = identifierDigest(defects);
  const make = () => new TempDirWorkspaces(dataRoot, service, repository, digest, defects);
  const provider = make();
  const binding: RepositoryBinding = { repository, remote: 'https://scm.example/acme/project.git', baseBranch: BASE_BRANCH };
  const checkout = async (attemptId: AttemptId) => mustParse(await provider.checkoutOf(attemptId));
  const update = async (attemptId: AttemptId, change: (state: LocalState) => LocalState) => {
    const directory = await checkout(attemptId);
    await writeState(directory, change(await readState(directory)));
  };
  const write = async (attemptId: AttemptId, path: string, entry: TreeEntry) => {
    const target = join(await checkout(attemptId), path);
    await rm(target, { force: true });
    await writeEntry(target, entry);
  };
  const fixture: WorkspaceFixture = {
    provider,
    dataRoot,
    identifierDigest: digest,
    binding,
    credentials: {
      read: credential('read', [repository], ['read-code']),
      write: credential('write', [repository], ['read-code', 'write-code']),
      foreign: credential('foreign', ['acme/other'], ['read-code', 'write-code', 'write-change-requests', 'write-statuses']),
    },
    baseTree: BASE_TREE,
    trackedPath: TRACKED,
    ignoredPath: IGNORED,
    separateExecutionIdentity: true,
    reopen: make,
    writeFile: (attemptId, path, text) => write(attemptId, path, textFile(text)),
    writeBytes: (attemptId, path, content) => write(attemptId, path, file(content)),
    writeExecutable: (attemptId, path, text) => write(attemptId, path, { type: 'file', mode: '100755', content: bytes(text) }),
    writeLink: (attemptId, path, target) => write(attemptId, path, { type: 'link', target }),
    linkToControlRecord: async (attemptId, path) => symlink(join(dataRoot, 'worker/identity'), join(await checkout(attemptId), path)),
    commitAll: async (attemptId) => {
      const directory = await checkout(attemptId);
      const state = await readState(directory);
      const ignored = ignoredPaths(service.entries(state.commit));
      const entries = Object.fromEntries(Object.entries(await workingTree(directory)).filter(([path]) => !ignored.has(path)));
      const commit = service.commit(entries, state.commit);
      await update(attemptId, (current) => ({ ...current, commit, index: storeTree(entries) }));
    },
    stage: async (attemptId, path) => {
      const entry = (await workingTree(await checkout(attemptId)))[path];
      await update(attemptId, (current) => {
        const { [path]: _staged, ...rest } = current.index;
        return { ...current, index: entry === undefined ? rest : { ...rest, [path]: store(entry) } };
      });
    },
    hardLinkOutside: async (attemptId, path) => {
      const outside = join(dataRoot, `outside-${attemptId}`);
      await link(join(await checkout(attemptId), path), outside);
      return (text) => writeFile(outside, text);
    },
    linkInGitDirectory: async (attemptId) => {
      await symlink(join(dataRoot, 'worker/journal'), join(await checkout(attemptId), '.git', 'objects'));
    },
    removeGitDirectory: async (attemptId) => rm(join(await checkout(attemptId), '.git'), { recursive: true }),
    nestGitFile: async (attemptId, gitDirectory) => {
      const nested = join(await checkout(attemptId), 'nested');
      await mkdir(nested);
      await writeFile(join(nested, '.git'), `gitdir: ${gitDirectory}\n`);
    },
    beginOperation: async (attemptId) => writeFile(join(await checkout(attemptId), OPERATION_FILE), 'merge'),
    switchBranch: async (attemptId, branch) => update(attemptId, (current) => ({ ...current, branch })),
    remoteHead: async (branch) => service.branches.get(branch),
    advanceRemote: async (branch) => {
      const parent = service.branches.get(branch) ?? service.branches.get(BASE_BRANCH) ?? null;
      const entries = { ...(parent === null ? {} : service.entries(parent)), [`remote-${service.commits.size}.txt`]: textFile('remote\n') };
      service.branches.set(branch, service.commit(entries, parent));
    },
    remoteCalls: async () => service.calls,
    commitGitlink: async (attemptId, path) => {
      const directory = await checkout(attemptId);
      const state = await readState(directory);
      const entries = { ...service.entries(state.commit), [path]: { type: 'gitlink', commit: UNKNOWN_SUBMODULE_COMMIT } } as const;
      await mkdir(join(directory, path), { recursive: true });
      const commit = service.commit(entries, state.commit);
      await update(attemptId, (current) => ({ ...current, commit, index: storeTree(entries) }));
    },
    gitProcesses: async () => [...service.processes],
    plantGitSetting: async (attemptId, key, setting) => appendFile(join(await checkout(attemptId), GIT_CONFIG_FILE), `${key} = ${setting}\n`),
    gitConfig: async (attemptId) => readFile(join(await checkout(attemptId), GIT_CONFIG_FILE), 'utf8').catch(() => ''),
    nativeHead: async (attemptId) => {
      const { commit } = await readState(await checkout(attemptId));
      return { commit, tree: service.commits.get(commit)?.tree ?? '' };
    },
    workspaceText: async (attemptId) => allText(dirname(await checkout(attemptId))),
    controlRecords: async () => {
      const worker = join(dataRoot, 'worker');
      const records = (await readdir(worker)).filter((entry) => entry !== 'workspaces').map((entry) => recordText(join(worker, entry)));
      return (await Promise.all(records)).join('\n');
    },
    readSnapshot: async (content) => decodeTar(content),
    interruptPrepare: async (attemptId) => {
      const staging = join(provider.root, `${WORKSPACE_LAYOUT.stagingPrefix}${provider.directoryName(attemptId)}`, WORKSPACE_LAYOUT.checkout);
      await mkdir(staging, { recursive: true });
      await symlink(join(dataRoot, 'worker/journal'), join(staging, 'journal-link'));
    },
    interruptRemove: async (attemptId) => {
      const name = provider.directoryName(attemptId);
      await rename(join(provider.root, name), join(provider.root, `${WORKSPACE_LAYOUT.removingPrefix}${name}`));
    },
    leaveLinkedLeftover: async (attemptId) => {
      const staging = `${WORKSPACE_LAYOUT.stagingPrefix}${provider.directoryName(attemptId)}`;
      await symlink(join(dataRoot, 'worker/executions'), join(provider.root, staging));
    },
    leftovers: async () => (await readdir(provider.root)).filter((entry) => entry.startsWith('.')).sort(),
  };
  return { fixture, dispose: () => rm(dataRoot, { recursive: true, force: true }) };
}
