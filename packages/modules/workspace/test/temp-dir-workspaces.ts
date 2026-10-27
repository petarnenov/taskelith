import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import {
  DIRTY_REASONS,
  TASK_BRANCH_PREFIX,
  WORKSPACE_LAYOUT,
  WORKSPACE_MODES,
  checkCredentialScope,
  cleanHead,
  parseCodeHeadIdentity,
  parseGitObjectId,
  taskBranchName,
  workspaceDirectoryName,
  workspaceFailure,
  type CodeHeadIdentity,
  type DirtyReason,
  type GitObjectId,
  type HeadSnapshot,
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

type Tree = Readonly<Record<string, TreeEntry>>;

// An entry as JSON can hold it: file bytes in base64, so nothing is lost.
type StoredEntry =
  | { readonly type: 'file'; readonly mode: '100644' | '100755'; readonly content: string }
  | { readonly type: 'link'; readonly target: string };

type StoredTree = Readonly<Record<string, StoredEntry>>;

function store(entry: TreeEntry): StoredEntry {
  return entry.type === 'link' ? entry : { ...entry, content: Buffer.from(entry.content).toString('base64') };
}

function load(entry: StoredEntry): TreeEntry {
  return entry.type === 'link' ? entry : { ...entry, content: new Uint8Array(Buffer.from(entry.content, 'base64')) };
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

const STATE_FILE = join('.git', 'state.json');
const OPERATION_FILE = join('.git', 'operation');
const SNAPSHOT_TYPE = 'application/json';

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

export class TempDirWorkspaces implements WorkspaceProvider {
  readonly root: string;
  readonly service: FakeGitService;
  readonly repository: RepositoryId;
  readonly defects: DoubleDefects;

  constructor(dataRoot: string, service: FakeGitService, repository: RepositoryId, defects: DoubleDefects = {}) {
    this.root = join(dataRoot, WORKSPACE_LAYOUT.root);
    this.service = service;
    this.repository = repository;
    this.defects = defects;
  }

  async prepare(request: PrepareWorkspace): Promise<Result<Workspace>> {
    if (this.defects.rejectsUnsafeNames && ![request.attemptId, request.taskId].every((text) => PRE_DERIVATION_NAME.test(text))) {
      return err(failure('invalid', 'the identifier is not a safe name'));
    }
    const name = this.directoryName(request.attemptId);
    const { target } = request;
    const taskBranch = this.defects.namesBranchByRawTaskId ? `${TASK_BRANCH_PREFIX}${request.taskId}` : taskBranchName(request.taskId);
    if (target.kind === 'at-head' && target.head.repository !== request.binding.repository) {
      return err(failure('invalid', 'the head belongs to another repository'));
    }
    if (this.defects.callsRemoteBeforeScopeInPrepare) this.service.calls += 1;
    const scope = this.scope(request.credential, request.binding.repository, 'read-code');
    if (!scope.ok) return scope;
    this.service.calls += 1;
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
    const target = join(this.root, this.directoryName(attemptId));
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

  async sweep(): Promise<void> {
    for (const entry of await readdir(this.root)) {
      if (!entry.startsWith(WORKSPACE_LAYOUT.stagingPrefix) && !entry.startsWith(WORKSPACE_LAYOUT.removingPrefix)) continue;
      const path = join(this.root, entry);
      if (this.defects.sweepFollowsLinks) await rm(await realpath(path), { recursive: true });
      await rm(path, { recursive: true, force: true });
    }
  }

  // The record first, so the state survives where no mode changes.
  async handOff(attemptId: AttemptId): Promise<Result<void>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    const handOff = () => this.handOffAlone(attemptId, checkout.value);
    return this.defects.racesHandOff ? handOff() : inHandOffChain(this.root, handOff);
  }

  private async handOffAlone(attemptId: AttemptId, checkout: string): Promise<Result<void>> {
    if (!this.defects.handsOffBeyondOne && (await this.handedOffElsewhere(attemptId))) {
      return workspaceFailure('precondition-failed', 'other-workspace-handed-off', 'another workspace is handed off');
    }
    await writeFile(handOffRecord(checkout), '', { mode: WORKSPACE_MODES.handOffRecord });
    await chmod(checkout, WORKSPACE_MODES.checkoutHandedOff);
    return ok(undefined);
  }

  // The double models a worker whose executions share a separate account.
  private async handedOffElsewhere(attemptId: AttemptId): Promise<boolean> {
    const others = (await this.list()).filter((other) => other !== attemptId);
    const records = others.map((other) => exists(join(this.root, this.directoryName(other), WORKSPACE_LAYOUT.handOffRecord)));
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
    const committed = this.service.entries(state.commit);
    const working = await workingTree(checkout.value);
    const ignored = ignoredPaths(committed);
    const reasons = new Set<DirtyReason>();
    for (const [path, entry] of Object.entries(committed)) if (!sameEntry(working[path], entry)) reasons.add('modified');
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
    let entries = this.service.entries(head.value.commit);
    if (this.defects.snapshotsWithoutMetadata) {
      entries = Object.fromEntries(Object.entries(entries).map(([path, entry]) => [path, entry.type === 'file' ? file(entry.content) : textFile(entry.target)]));
    }
    if (this.defects.corruptsBinary) {
      const lossy = (entry: TreeEntry) => (entry.type === 'file' ? { ...entry, content: bytes(new TextDecoder().decode(entry.content)) } : entry);
      entries = Object.fromEntries(Object.entries(entries).map(([path, entry]) => [path, lossy(entry)]));
    }
    if (this.defects.snapshotsCommit) entries = { ...entries, COMMIT: textFile(head.value.commit) };
    const content = new TextEncoder().encode(canonical(entries));
    return ok({ head: this.defects.snapshotsStaleTree ? this.staleHead(head.value) : head.value, contentType: SNAPSHOT_TYPE, content });
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
    this.service.calls += 1;
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
    this.service.calls += 1;
    const remote = this.service.branches.get(opened.value.branch) ?? null;
    if (remote !== request.expectedRemoteHead) return workspaceFailure('conflict', 'remote-moved', 'the remote task branch moved');
    if (remote !== null && !this.service.descends(head.value.commit, remote)) {
      return workspaceFailure('conflict', 'not-fast-forward', 'the push is not a fast-forward');
    }
    this.service.branches.set(opened.value.branch, head.value.commit);
    return head;
  }

  directoryName(attemptId: AttemptId): string {
    return this.defects.namesDirectoryByEncoding ? percentEncoded(attemptId) : workspaceDirectoryName(attemptId);
  }

  async checkoutOf(attemptId: AttemptId): Promise<Result<string>> {
    const checkout = join(this.root, this.directoryName(attemptId), WORKSPACE_LAYOUT.checkout);
    return (await exists(checkout)) ? ok(checkout) : err(failure('not-found', `no workspace ${attemptId}`));
  }

  private async taskBranchOf(attemptId: AttemptId, credential: WorkspaceCredential, access: RemoteAccess): Promise<Result<{ branch: string }>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    const { expectedBranch } = await readMetadata(checkout.value);
    if (expectedBranch === null) return workspaceFailure('invalid', 'read-only-workspace', 'an at-head workspace has no task branch');
    const scope = this.scope(credential, this.repository, access);
    return scope.ok ? ok({ branch: expectedBranch }) : scope;
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

function sameEntry(left: TreeEntry | undefined, right: TreeEntry): boolean {
  return left !== undefined && JSON.stringify(store(left)) === JSON.stringify(store(right));
}

function sameTree(left: Tree, right: Tree): boolean {
  return canonical(left) === canonical(right);
}

function ignoredPaths(tree: Tree): Set<string> {
  const rules = tree['.gitignore'];
  return new Set(rules?.type === 'file' ? new TextDecoder().decode(rules.content).split('\n').filter(Boolean) : []);
}

async function writeEntry(path: string, entry: TreeEntry): Promise<void> {
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

const BASE_BRANCH = 'main';
const TRACKED = 'README.md';
const IGNORED = 'build.log';
const BASE_TREE: Tree = { [TRACKED]: textFile('base\n'), '.gitignore': textFile(`${IGNORED}\n`) };

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
  const dataRoot = await mkdtemp(join(tmpdir(), 'taskelith-workspace-'));
  for (const [path, text] of Object.entries(CONTROL_RECORDS)) {
    await mkdir(dirname(join(dataRoot, path)), { recursive: true });
    await writeFile(join(dataRoot, path), text);
  }
  await mkdir(join(dataRoot, WORKSPACE_LAYOUT.root), { recursive: true });
  const service = new FakeGitService(BASE_BRANCH, BASE_TREE);
  const repository = mustParse(parseIdentifier('RepositoryId', 'acme/project')) as RepositoryId;
  const make = () => new TempDirWorkspaces(dataRoot, service, repository, defects);
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
    readSnapshot: async (content) => {
      const stored = JSON.parse(new TextDecoder().decode(content)) as [string, StoredEntry][];
      return Object.fromEntries(stored.map(([path, entry]) => [path, load(entry)]));
    },
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
