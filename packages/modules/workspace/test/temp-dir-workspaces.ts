import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import {
  DIRTY_REASONS,
  WORKSPACE_LAYOUT,
  checkCredentialScope,
  cleanHead,
  parseCodeHeadIdentity,
  taskBranchName,
  workspaceDirectoryName,
  workspaceFailure,
  type CodeHeadIdentity,
  type DirtyReason,
  type HeadSnapshot,
  type PrepareWorkspace,
  type PushTaskBranch,
  type RepositoryBinding,
  type RepositoryId,
  type Workspace,
  type WorkspaceCredential,
  type WorkspaceFixture,
  type WorkspaceKind,
  type WorkspaceProvider,
  type WorkspaceStatus,
} from '@taskelith/workspace';

// A test-only provider: real directories under a temporary data root and
// a fake Git service whose objects are content-addressed file maps.

type Files = Readonly<Record<string, string>>;

interface Commit {
  readonly tree: string;
  readonly parent: string | null;
  readonly files: Files;
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');
const canonical = (files: Files) => JSON.stringify(Object.keys(files).sort().map((path) => [path, files[path]]));

export class FakeGitService {
  readonly commits = new Map<string, Commit>();
  readonly branches = new Map<string, string>();
  #sequence = 0;

  constructor(baseBranch: string, baseFiles: Files) {
    this.branches.set(baseBranch, this.commit(baseFiles, null));
  }

  commit(files: Files, parent: string | null): string {
    this.#sequence += 1;
    const tree = sha1(canonical(files));
    const id = sha1(JSON.stringify({ tree, parent, sequence: this.#sequence }));
    this.commits.set(id, { tree, parent, files });
    return id;
  }

  descends(commit: string, ancestor: string): boolean {
    for (let current: string | null = commit; current !== null; current = this.commits.get(current)?.parent ?? null) {
      if (current === ancestor) return true;
    }
    return false;
  }
}

// What the double keeps in the checkout's `.git`; a real adapter uses Git.
interface LocalState {
  readonly projectId: string;
  readonly taskId: string;
  readonly kind: WorkspaceKind;
  readonly expectedBranch: string | null;
  readonly branch: string | null;
  readonly commit: string;
  readonly remote: string;
}

const STATE_FILE = join('.git', 'state.json');
const OPERATION_FILE = join('.git', 'operation');
const SNAPSHOT_TYPE = 'application/json';

export interface DoubleDefects {
  readonly storesSecret?: boolean;
  readonly ignoresUntracked?: boolean;
  readonly removesWorkspacesRoot?: boolean;
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
    const name = workspaceDirectoryName(request.attemptId);
    if (!name.ok) return name;
    const branch = request.target.kind === 'task-branch' ? taskBranchName(request.taskId) : ok(null);
    if (!branch.ok) return branch;
    if (request.target.kind === 'at-head' && request.target.head.repository !== request.binding.repository) {
      return err(failure('invalid', 'the head belongs to another repository'));
    }
    const scope = checkCredentialScope(request.credential, request.binding.repository, 'read-code');
    if (!scope.ok) return scope;
    const commit = this.startCommit(request, branch.value);
    if (commit === undefined) return err(failure('not-found', 'the base branch or the head is unknown'));
    const final = join(this.root, name.value);
    if (await exists(final)) return err(failure('conflict', `workspace ${name.value} exists`));
    const staging = join(this.root, `${WORKSPACE_LAYOUT.stagingPrefix}${name.value}`);
    const secret = this.defects.storesSecret ? `https://${request.credential.secret}@` : '';
    const state: LocalState = {
      projectId: request.projectId, taskId: request.taskId, kind: request.target.kind,
      expectedBranch: branch.value, branch: branch.value, commit, remote: `${secret}${request.binding.remote}`,
    };
    await this.checkout(join(staging, WORKSPACE_LAYOUT.checkout), state);
    await rename(staging, final);
    const head = this.head(commit);
    return ok({
      attemptId: request.attemptId, projectId: request.projectId, taskId: request.taskId, kind: request.target.kind,
      branch: branch.value, workingDirectory: join(final, WORKSPACE_LAYOUT.checkout), head,
    });
  }

  async list(): Promise<readonly AttemptId[]> {
    const names = (await readdir(this.root)).filter((entry) => !entry.startsWith('.')).sort();
    return names.map((entry) => mustParse(parseIdentifier('AttemptId', entry)));
  }

  async remove(attemptId: AttemptId): Promise<Result<void>> {
    const name = workspaceDirectoryName(attemptId);
    if (!name.ok) return name;
    const target = join(this.root, name.value);
    if (!(await exists(target))) return ok(undefined);
    if (this.defects.removesWorkspacesRoot) {
      await rm(this.root, { recursive: true });
      await mkdir(this.root);
      return ok(undefined);
    }
    const removing = join(this.root, `${WORKSPACE_LAYOUT.removingPrefix}${name.value}`);
    await rename(target, removing);
    await rm(removing, { recursive: true });
    return ok(undefined);
  }

  async sweep(): Promise<void> {
    for (const entry of await readdir(this.root)) {
      if (entry.startsWith(WORKSPACE_LAYOUT.stagingPrefix) || entry.startsWith(WORKSPACE_LAYOUT.removingPrefix)) {
        await rm(join(this.root, entry), { recursive: true });
      }
    }
  }

  async inspect(attemptId: AttemptId): Promise<Result<WorkspaceStatus>> {
    const checkout = await this.checkoutOf(attemptId);
    if (!checkout.ok) return checkout;
    const state = await readState(checkout.value);
    const files = this.service.commits.get(state.commit)?.files ?? {};
    const working = await workingFiles(checkout.value);
    const ignored = new Set((files['.gitignore'] ?? '').split('\n').filter(Boolean));
    const reasons = new Set<DirtyReason>();
    for (const [path, text] of Object.entries(files)) if (working[path] !== text) reasons.add('modified');
    for (const path of Object.keys(working)) if (!(path in files) && !ignored.has(path) && !this.defects.ignoresUntracked) reasons.add('untracked');
    if (await exists(join(checkout.value, OPERATION_FILE))) reasons.add('operation-in-progress');
    if (state.branch !== state.expectedBranch) reasons.add('off-branch');
    const dirtyReasons = DIRTY_REASONS.filter((reason) => reasons.has(reason));
    return ok({ head: this.head(state.commit), branch: state.branch, dirtyReasons });
  }

  async snapshot(attemptId: AttemptId): Promise<Result<HeadSnapshot>> {
    const current = await this.inspect(attemptId);
    if (!current.ok) return current;
    const head = cleanHead(current.value);
    if (!head.ok) return head;
    const files = this.service.commits.get(head.value.commit)?.files ?? {};
    return ok({ head: head.value, contentType: SNAPSHOT_TYPE, content: new TextEncoder().encode(canonical(files)) });
  }

  async push(request: PushTaskBranch): Promise<Result<CodeHeadIdentity>> {
    const checkout = await this.checkoutOf(request.attemptId);
    if (!checkout.ok) return checkout;
    const state = await readState(checkout.value);
    if (state.kind !== 'task-branch' || state.expectedBranch === null) {
      return workspaceFailure('invalid', 'read-only-workspace', 'an at-head workspace never pushes');
    }
    const scope = checkCredentialScope(request.credential, this.repository, 'write-code');
    if (!scope.ok) return scope;
    const current = await this.inspect(request.attemptId);
    if (!current.ok) return current;
    const head = cleanHead(current.value);
    if (!head.ok) return head;
    const remote = this.service.branches.get(state.expectedBranch) ?? null;
    if (remote !== request.expectedRemoteHead) return workspaceFailure('conflict', 'remote-moved', 'the remote task branch moved');
    if (remote !== null && !this.service.descends(head.value.commit, remote)) {
      return workspaceFailure('conflict', 'not-fast-forward', 'the push is not a fast-forward');
    }
    this.service.branches.set(state.expectedBranch, head.value.commit);
    return head;
  }

  async checkoutOf(attemptId: AttemptId): Promise<Result<string>> {
    const name = workspaceDirectoryName(attemptId);
    if (!name.ok) return name;
    const checkout = join(this.root, name.value, WORKSPACE_LAYOUT.checkout);
    return (await exists(checkout)) ? ok(checkout) : err(failure('not-found', `no workspace ${name.value}`));
  }

  head(commit: string): CodeHeadIdentity {
    const tree = this.service.commits.get(commit)?.tree ?? '';
    return mustParse(parseCodeHeadIdentity({ repository: this.repository, commit, tree }));
  }

  private startCommit(request: PrepareWorkspace, branch: string | null): string | undefined {
    if (request.target.kind === 'at-head') {
      const { commit } = request.target.head;
      return this.service.commits.has(commit) ? commit : undefined;
    }
    if (!this.service.branches.has(request.binding.baseBranch)) return undefined;
    return this.service.branches.get(branch ?? '') ?? this.service.branches.get(request.binding.baseBranch);
  }

  private async checkout(directory: string, state: LocalState): Promise<void> {
    await mkdir(join(directory, '.git'), { recursive: true });
    for (const [path, text] of Object.entries(this.service.commits.get(state.commit)?.files ?? {})) {
      await writeFile(join(directory, path), text);
    }
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

async function readState(checkout: string): Promise<LocalState> {
  return JSON.parse(await readFile(join(checkout, STATE_FILE), 'utf8')) as LocalState;
}

async function writeState(checkout: string, state: LocalState): Promise<void> {
  await writeFile(join(checkout, STATE_FILE), JSON.stringify(state));
}

// Regular files and links outside `.git`; a link is never followed.
async function workingFiles(checkout: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(join(checkout, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (path === '.git') continue;
    if (entry.isDirectory()) Object.assign(files, await workingFiles(checkout, path));
    else files[path] = entry.isSymbolicLink() ? `link:${path}` : await readFile(join(checkout, path), 'utf8');
  }
  return files;
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

function credential(credentialId: string, repositories: string[], permissions: string[]): WorkspaceCredential {
  return { credentialId, secret: `secret-of-${credentialId}`, repositories, permissions };
}

// A fresh data root with control records, a service, and the fixture.
export async function createFixture(defects: DoubleDefects = {}): Promise<{ fixture: WorkspaceFixture; dispose: () => Promise<void> }> {
  const dataRoot = await mkdtemp(join(tmpdir(), 'taskelith-workspace-'));
  const records: Files = {
    'worker/identity': 'identity', 'worker/lock': '', 'worker/journal/journal.sqlite': 'journal',
    'worker/credentials/control-plane.1': 'credential', 'worker/executions/execution-1/intent': 'intent',
  };
  for (const [path, text] of Object.entries(records)) {
    await mkdir(dirname(join(dataRoot, path)), { recursive: true });
    await writeFile(join(dataRoot, path), text);
  }
  await mkdir(join(dataRoot, WORKSPACE_LAYOUT.root), { recursive: true });
  const service = new FakeGitService(BASE_BRANCH, { [TRACKED]: 'base\n', '.gitignore': `${IGNORED}\n` });
  const repository = mustParse(parseIdentifier('RepositoryId', 'acme/project')) as RepositoryId;
  const make = () => new TempDirWorkspaces(dataRoot, service, repository, defects);
  const provider = make();
  const binding: RepositoryBinding = { repository, remote: 'https://scm.example/acme/project.git', baseBranch: BASE_BRANCH };
  const checkout = async (attemptId: AttemptId) => mustParse(await provider.checkoutOf(attemptId));
  const update = async (attemptId: AttemptId, change: (state: LocalState) => LocalState) => {
    const directory = await checkout(attemptId);
    await writeState(directory, change(await readState(directory)));
  };
  const fixture: WorkspaceFixture = {
    provider,
    binding,
    credentials: {
      read: credential('read', [repository], ['read-code']),
      write: credential('write', [repository], ['read-code', 'write-code']),
      foreign: credential('foreign', ['acme/other'], ['read-code', 'write-code', 'write-change-requests', 'write-statuses']),
    },
    trackedPath: TRACKED,
    ignoredPath: IGNORED,
    reopen: make,
    writeFile: async (attemptId, path, text) => writeFile(join(await checkout(attemptId), path), text),
    linkToControlRecord: async (attemptId, path) => symlink(join(dataRoot, 'worker/identity'), join(await checkout(attemptId), path)),
    commitAll: async (attemptId) => {
      const directory = await checkout(attemptId);
      const state = await readState(directory);
      const ignored = new Set((service.commits.get(state.commit)?.files['.gitignore'] ?? '').split('\n'));
      const files = Object.fromEntries(Object.entries(await workingFiles(directory)).filter(([path]) => !ignored.has(path)));
      await update(attemptId, (current) => ({ ...current, commit: service.commit(files, current.commit) }));
    },
    beginOperation: async (attemptId) => writeFile(join(await checkout(attemptId), OPERATION_FILE), 'merge'),
    switchBranch: async (attemptId, branch) => update(attemptId, (current) => ({ ...current, branch })),
    remoteHead: async (branch) => service.branches.get(branch),
    advanceRemote: async (branch) => {
      const parent = service.branches.get(branch) ?? service.branches.get(BASE_BRANCH) ?? null;
      const files = { ...(parent === null ? {} : service.commits.get(parent)?.files), [`remote-${service.commits.size}.txt`]: 'remote\n' };
      service.branches.set(branch, service.commit(files, parent));
    },
    workspaceText: async (attemptId) => allText(dirname(await checkout(attemptId))),
    controlRecords: async () => {
      const worker = join(dataRoot, 'worker');
      const entries = await readdir(worker);
      const records = entries.filter((entry) => entry !== 'workspaces').map((entry) => recordText(join(worker, entry)));
      return (await Promise.all(records)).join('\n');
    },
    readSnapshot: async (content) => Object.fromEntries(JSON.parse(new TextDecoder().decode(content)) as [string, string][]),
    interruptPrepare: async (attemptId) => {
      await mkdir(join(provider.root, `${WORKSPACE_LAYOUT.stagingPrefix}${attemptId}`, WORKSPACE_LAYOUT.checkout), { recursive: true });
    },
    interruptRemove: async (attemptId) => {
      await rename(join(provider.root, attemptId), join(provider.root, `${WORKSPACE_LAYOUT.removingPrefix}${attemptId}`));
    },
    leftovers: async () => (await readdir(provider.root)).filter((entry) => entry.startsWith('.')).sort(),
  };
  return { fixture, dispose: () => rm(dataRoot, { recursive: true, force: true }) };
}
