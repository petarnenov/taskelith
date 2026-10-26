import { parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import { expectCode, expectSame, expectSuccess, type ConformanceCase, type ProjectId, type TaskId } from '@taskelith/sdlc';
import { isSameCodeHead, parseGitObjectId, type CodeHeadIdentity, type GitObjectId, type RepositoryId } from '../domain/code-head.js';
import type { HeadSnapshot, Workspace, WorkspaceCredential, WorkspaceStatus, WorkspaceTarget } from '../domain/workspace.js';
import type { TreeEntry, WorkspaceFixture } from './workspace-fixture.js';
import type { PrepareWorkspace } from './workspace-provider.js';

// The shared suite of the workspace port (contract section 12).

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => must(parseIdentifier(kind, text));
const attempt = (text: string) => id('AttemptId', text) as AttemptId;
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const TASK = id('TaskId', 'task-1') as TaskId;
const TASK_BRANCH = 'taskelith/task-1';
const FIRST = attempt('attempt-1');
const SECOND = attempt('attempt-2');
const THIRD = attempt('attempt-3');
const UNKNOWN_COMMIT = must(parseGitObjectId('0'.repeat(40)));
const TASK_BRANCH_TARGET: WorkspaceTarget = Object.freeze({ kind: 'task-branch' });
// Bytes that are not valid UTF-8, so a text round trip would change them.
const BINARY = Uint8Array.of(0, 128, 255);
const text = (value: string) => new TextEncoder().encode(value);

function request(fixture: WorkspaceFixture, overrides: Partial<PrepareWorkspace> = {}): PrepareWorkspace {
  return {
    attemptId: FIRST,
    projectId: PROJECT,
    taskId: TASK,
    binding: fixture.binding,
    target: TASK_BRANCH_TARGET,
    credential: fixture.credentials.read,
    ...overrides,
  };
}

function value<T>(problems: string[], label: string, result: Result<T>): T | undefined {
  if (result.ok) return result.value;
  problems.push(`${label}: expected success, got ${result.error.code}: ${result.error.message}`);
  return undefined;
}

function expectReason(problems: string[], label: string, result: Result<unknown>, code: string, reason: string): void {
  expectCode(problems, label, result, code);
  if (!result.ok) expectSame(problems, `${label} reason`, result.error.details.reason, reason);
}

// A prepared workspace, whose head must be the commit and tree it holds.
async function prepared(problems: string[], fixture: WorkspaceFixture, overrides: Partial<PrepareWorkspace> = {}) {
  const attemptId = overrides.attemptId ?? FIRST;
  const workspace = value(problems, `prepare ${attemptId}`, await fixture.provider.prepare(request(fixture, overrides)));
  if (workspace === undefined) return undefined;
  const { commit, tree } = workspace.head;
  expectSame(problems, `prepared head of ${attemptId}`, { commit, tree }, await fixture.nativeHead(attemptId));
  return workspace;
}

// The status, whose head must be the commit and tree that Git reports.
async function status(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId): Promise<WorkspaceStatus | undefined> {
  const current = value(problems, `inspect ${attemptId}`, await fixture.provider.inspect(attemptId));
  if (current === undefined) return undefined;
  const { commit, tree } = current.head;
  expectSame(problems, `head of ${attemptId}`, { commit, tree }, await fixture.nativeHead(attemptId));
  return current;
}

// A snapshot whose head must be the workspace's current head.
async function snapshotOf(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId, label: string): Promise<HeadSnapshot | undefined> {
  const current = await status(problems, fixture, attemptId);
  const taken = value(problems, label, await fixture.provider.snapshot(attemptId));
  if (current !== undefined && taken !== undefined) sameHead(problems, `${label} head`, taken.head, current.head);
  return taken;
}

async function expectDirty(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId, reasons: readonly string[]) {
  const current = await status(problems, fixture, attemptId);
  if (current !== undefined) expectSame(problems, `dirty reasons of ${attemptId}`, current.dirtyReasons, reasons);
}

async function remoteHead(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId): Promise<GitObjectId | null | undefined> {
  const read = await fixture.provider.readRemoteHead({ attemptId, credential: fixture.credentials.read });
  return value(problems, `remote head for ${attemptId}`, read);
}

// A pushed head that another attempt can open at.
async function pushedHead(problems: string[], fixture: WorkspaceFixture, file: string): Promise<CodeHeadIdentity | undefined> {
  if ((await prepared(problems, fixture)) === undefined) return undefined;
  await fixture.writeFile(FIRST, file, `${file} content\n`);
  await fixture.commitAll(FIRST, `add ${file}`);
  const write = fixture.credentials.write;
  return value(problems, 'push', await fixture.provider.push({ attemptId: FIRST, credential: write, expectedRemoteHead: null }));
}

function secretsIn(text: string, credentials: readonly WorkspaceCredential[]): string[] {
  return credentials.filter((credential) => text.includes(credential.secret)).map((credential) => credential.credentialId);
}

function sameHead(problems: string[], label: string, actual: CodeHeadIdentity | undefined, expected: CodeHeadIdentity) {
  if (actual === undefined || !isSameCodeHead(actual, expected)) problems.push(`${label}: expected the same code head`);
}

const WORKSPACE_PREPARATION: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'prepares a task branch workspace at the base head',
    async check(fixture) {
      const problems: string[] = [];
      const workspace = await prepared(problems, fixture);
      if (workspace === undefined) return problems;
      const expected: Partial<Workspace> = { attemptId: FIRST, projectId: PROJECT, taskId: TASK, kind: 'task-branch', branch: TASK_BRANCH };
      expectSame(problems, 'record', { ...workspace, workingDirectory: undefined, head: undefined }, expected);
      expectSame(problems, 'repository', workspace.head.repository, fixture.binding.repository);
      expectSame(problems, 'base head', workspace.head.commit, await fixture.remoteHead(fixture.binding.baseBranch));
      expectSame(problems, 'status', await fixture.provider.inspect(FIRST), { ok: true, value: { head: workspace.head, branch: TASK_BRANCH, dirtyReasons: [] } });
      expectSame(problems, 'listed', await fixture.provider.list(), [FIRST]);
      await fixture.writeFile(FIRST, 'kept.txt', 'kept\n');
      expectCode(problems, 'prepare again', await fixture.provider.prepare(request(fixture)), 'conflict');
      await expectDirty(problems, fixture, FIRST, ['untracked']);
      return problems;
    },
  },
  {
    name: 'continues the task branch when the remote has it',
    async check(fixture) {
      const problems: string[] = [];
      await fixture.advanceRemote(TASK_BRANCH);
      const workspace = await prepared(problems, fixture);
      if (workspace !== undefined) expectSame(problems, 'task head', workspace.head.commit, await fixture.remoteHead(TASK_BRANCH));
      return problems;
    },
  },
  {
    name: 'opens a read-only workspace at a given head, detached',
    async check(fixture) {
      const problems: string[] = [];
      const head = await pushedHead(problems, fixture, 'change.txt');
      if (head === undefined) return problems;
      const target: WorkspaceTarget = { kind: 'at-head', head };
      const review = await prepared(problems, fixture, { attemptId: SECOND, target });
      if (review === undefined) return problems;
      expectSame(problems, 'kind and branch', [review.kind, review.branch], ['at-head', null]);
      sameHead(problems, 'review head', review.head, head);
      const push = { attemptId: SECOND, credential: fixture.credentials.write, expectedRemoteHead: head.commit };
      expectReason(problems, 'push from a review workspace', await fixture.provider.push(push), 'invalid', 'read-only-workspace');
      const read = await fixture.provider.readRemoteHead({ attemptId: SECOND, credential: fixture.credentials.read });
      expectReason(problems, 'remote head of a review workspace', read, 'invalid', 'read-only-workspace');
      return problems;
    },
  },
  {
    name: 'rejects unsafe names, foreign or mismatched heads, and missing sources, leaving nothing',
    async check(fixture) {
      const problems: string[] = [];
      const base = await prepared(problems, fixture, { attemptId: THIRD });
      if (base === undefined) return problems;
      expectSuccess(problems, 'remove the probe', await fixture.provider.remove(THIRD));
      const foreignRepository = id('RepositoryId', `${fixture.binding.repository}-other`) as RepositoryId;
      const { commit, tree } = base.head;
      const at = (head: CodeHeadIdentity): Partial<PrepareWorkspace> => ({ target: { kind: 'at-head', head } });
      const unsafeTask = id('TaskId', '../unsafe') as TaskId;
      const foreign = fixture.credentials.foreign;
      const cases: [string, Partial<PrepareWorkspace>, string, string | undefined][] = [
        ['unsafe attempt', { attemptId: attempt('../attempt') }, 'invalid', 'unsafe-name'],
        ['unsafe task', { taskId: id('TaskId', 'task/1') as TaskId }, 'invalid', 'unsafe-name'],
        ['unsafe task at a head', { ...at(base.head), taskId: unsafeTask, credential: foreign }, 'invalid', 'unsafe-name'],
        ['foreign head', at({ repository: foreignRepository, commit, tree }), 'invalid', undefined],
        ['unknown head', at({ repository: fixture.binding.repository, commit: UNKNOWN_COMMIT, tree }), 'not-found', undefined],
        ['mismatched tree', at({ ...base.head, tree: commit }), 'invalid', 'head-mismatch'],
        ['missing base', { binding: { ...fixture.binding, baseBranch: 'missing-base' } }, 'not-found', undefined],
      ];
      for (const [label, overrides, code, reason] of cases) {
        const result = await fixture.provider.prepare(request(fixture, overrides));
        if (reason === undefined) expectCode(problems, label, result, code);
        else expectReason(problems, label, result, code, reason);
      }
      expectSame(problems, 'listed', await fixture.provider.list(), []);
      expectSame(problems, 'leftovers', await fixture.leftovers(), []);
      expectCode(problems, 'unsafe removal', await fixture.provider.remove(attempt('..')), 'invalid');
      return problems;
    },
  },
];

const CREDENTIAL_USE: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'refuses an out-of-scope credential before any remote call and never stores one',
    async check(fixture) {
      const problems: string[] = [];
      const { read, write, foreign } = fixture.credentials;
      // The operation starts only after the count is read.
      const refused = async (label: string, operation: () => Promise<Result<unknown>>) => {
        const before = await fixture.remoteCalls();
        expectReason(problems, label, await operation(), 'forbidden', 'credential-out-of-scope');
        expectSame(problems, `${label} remote calls`, (await fixture.remoteCalls()) - before, 0);
      };
      await refused('prepare with a foreign credential', () => fixture.provider.prepare(request(fixture, { credential: foreign })));
      if ((await prepared(problems, fixture)) === undefined) return problems;
      await fixture.writeFile(FIRST, 'change.txt', 'change\n');
      await fixture.commitAll(FIRST, 'change');
      const push = { attemptId: FIRST, expectedRemoteHead: null };
      await refused('push with read-only', () => fixture.provider.push({ ...push, credential: read }));
      await refused('push with a foreign writer', () => fixture.provider.push({ ...push, credential: foreign }));
      await refused('remote head with a foreign credential', () => fixture.provider.readRemoteHead({ attemptId: FIRST, credential: foreign }));
      expectSame(problems, 'nothing pushed', await fixture.remoteHead(TASK_BRANCH), undefined);
      expectSuccess(problems, 'push with write', await fixture.provider.push({ ...push, credential: write }));
      expectSame(problems, 'secrets in the workspace', secretsIn(await fixture.workspaceText(FIRST), [read, write, foreign]), []);
      return problems;
    },
  },
];

const HEAD_STATE: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'reports modified and untracked files, ignores ignored ones, and is clean after a commit',
    async check(fixture) {
      const problems: string[] = [];
      const workspace = await prepared(problems, fixture);
      if (workspace === undefined) return problems;
      await fixture.writeFile(FIRST, fixture.ignoredPath, 'ignored\n');
      await expectDirty(problems, fixture, FIRST, []);
      await fixture.writeFile(FIRST, fixture.trackedPath, 'changed\n');
      await expectDirty(problems, fixture, FIRST, ['modified']);
      await fixture.writeFile(FIRST, 'new.txt', 'new\n');
      await expectDirty(problems, fixture, FIRST, ['modified', 'untracked']);
      await fixture.commitAll(FIRST, 'commit');
      const after = await status(problems, fixture, FIRST);
      if (after === undefined) return problems;
      expectSame(problems, 'clean', after.dirtyReasons, []);
      const moved = [after.head.commit !== workspace.head.commit, after.head.tree !== workspace.head.tree];
      expectSame(problems, 'new commit and tree', moved, [true, true]);
      return problems;
    },
  },
  {
    name: 'reports an unfinished operation and a switched branch',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      await fixture.beginOperation(FIRST);
      await expectDirty(problems, fixture, FIRST, ['operation-in-progress']);
      await fixture.switchBranch(SECOND, 'elsewhere');
      await expectDirty(problems, fixture, SECOND, ['off-branch']);
      expectCode(problems, 'snapshot off-branch', await fixture.provider.snapshot(SECOND), 'precondition-failed');
      return problems;
    },
  },
  {
    name: 'reports a change staged and then reverted in the working tree, and keeps that workspace',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      const original = fixture.baseTree[fixture.trackedPath];
      if (original?.type !== 'file') return [...problems, 'fixture: the tracked path must be a file of the base tree'];
      await fixture.writeFile(FIRST, fixture.trackedPath, 'staged\n');
      await fixture.stage(FIRST, fixture.trackedPath);
      await fixture.writeBytes(FIRST, fixture.trackedPath, original.content);
      await expectDirty(problems, fixture, FIRST, ['modified']);
      const push = { attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null };
      expectReason(problems, 'snapshot', await fixture.provider.snapshot(FIRST), 'precondition-failed', 'workspace-dirty');
      expectReason(problems, 'push', await fixture.provider.push(push), 'precondition-failed', 'workspace-dirty');
      expectReason(problems, 'remove', await fixture.provider.remove(FIRST), 'precondition-failed', 'workspace-dirty');
      expectSame(problems, 'nothing pushed', await fixture.remoteHead(TASK_BRANCH), undefined);
      expectSame(problems, 'kept', await fixture.provider.list(), [FIRST]);
      await expectDirty(problems, fixture, FIRST, ['modified']);
      return problems;
    },
  },
  {
    name: 'a new commit with the same tree is a new head',
    async check(fixture) {
      const problems: string[] = [];
      const workspace = await prepared(problems, fixture);
      if (workspace === undefined) return problems;
      await fixture.commitAll(FIRST, 'empty');
      const after = await status(problems, fixture, FIRST);
      if (after === undefined) return problems;
      expectSame(problems, 'same tree, other commit', [after.head.tree === workspace.head.tree, after.head.commit !== workspace.head.commit], [true, true]);
      expectSame(problems, 'a new head', isSameCodeHead(after.head, workspace.head), false);
      return problems;
    },
  },
];

const PUSHES: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'pushes a clean task branch fast-forward at the remote head the port reports',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      const base = await fixture.remoteHead(fixture.binding.baseBranch);
      const credential = fixture.credentials.write;
      expectSame(problems, 'absent task branch', await remoteHead(problems, fixture, FIRST), null);
      await fixture.writeFile(FIRST, 'new.txt', 'new\n');
      const dirty = await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null });
      expectReason(problems, 'dirty', dirty, 'precondition-failed', 'workspace-dirty');
      await fixture.commitAll(FIRST, 'first');
      const wrong = await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: UNKNOWN_COMMIT });
      expectReason(problems, 'wrong expectation', wrong, 'conflict', 'remote-moved');
      const pushed = value(problems, 'first push', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null }));
      const current = await status(problems, fixture, FIRST);
      if (pushed === undefined || current === undefined) return problems;
      sameHead(problems, 'pushed head', pushed, current.head);
      expectSame(problems, 'remote task branch', await fixture.remoteHead(TASK_BRANCH), pushed.commit);
      expectSame(problems, 'base unchanged', await fixture.remoteHead(fixture.binding.baseBranch), base);
      // A later attempt continues from the head the port reports.
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      const continued = await remoteHead(problems, fixture, SECOND);
      expectSame(problems, 'continued remote head', continued, pushed.commit);
      await fixture.writeFile(SECOND, 'second.txt', 'second\n');
      await fixture.commitAll(SECOND, 'second');
      const next = { attemptId: SECOND, credential, expectedRemoteHead: continued ?? null };
      const second = value(problems, 'continuing push', await fixture.provider.push(next));
      if (second === undefined) return problems;
      // Recovery after another party moved the branch.
      await fixture.advanceRemote(TASK_BRANCH);
      await fixture.writeFile(SECOND, 'third.txt', 'third\n');
      await fixture.commitAll(SECOND, 'third');
      const stale = await fixture.provider.push({ ...next, expectedRemoteHead: second.commit });
      expectReason(problems, 'remote moved', stale, 'conflict', 'remote-moved');
      const moved = await remoteHead(problems, fixture, SECOND);
      expectSame(problems, 'moved remote head', moved, await fixture.remoteHead(TASK_BRANCH));
      const diverged = await fixture.provider.push({ ...next, expectedRemoteHead: moved ?? null });
      expectReason(problems, 'not fast-forward', diverged, 'conflict', 'not-fast-forward');
      expectSame(problems, 'remote kept', await fixture.remoteHead(TASK_BRANCH), moved);
      return problems;
    },
  },
];

function sortedTree(tree: Readonly<Record<string, TreeEntry>>): Record<string, TreeEntry> {
  return Object.fromEntries(Object.entries(tree).sort(([left], [right]) => (left < right ? -1 : 1)));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

const SNAPSHOTS: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'snapshots exactly the clean head tree, in bytes that depend on the tree alone',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      await fixture.writeFile(FIRST, 'change.txt', 'change\n');
      await fixture.writeExecutable(FIRST, 'run.sh', 'echo run\n');
      await fixture.writeLink(FIRST, 'latest', 'change.txt');
      await fixture.writeBytes(FIRST, 'blob.bin', BINARY);
      await fixture.commitAll(FIRST, 'tree');
      const credential = fixture.credentials.write;
      // Published, so that a fresh clone can open the same head.
      const pushed = value(problems, 'push', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null }));
      await fixture.writeFile(FIRST, fixture.ignoredPath, 'ignored\n');
      const first = await snapshotOf(problems, fixture, FIRST, 'snapshot');
      if (first === undefined || pushed === undefined) return problems;
      sameHead(problems, 'snapshot of the pushed head', first.head, pushed);
      const expected = sortedTree({
        ...fixture.baseTree,
        'change.txt': { type: 'file', mode: '100644', content: text('change\n') },
        'run.sh': { type: 'file', mode: '100755', content: text('echo run\n') },
        'blob.bin': { type: 'file', mode: '100644', content: BINARY },
        latest: { type: 'link', target: 'change.txt' },
      });
      expectSame(problems, 'tree', sortedTree(await fixture.readSnapshot(first.content)), expected);
      const review = await prepared(problems, fixture, { attemptId: SECOND, target: { kind: 'at-head', head: first.head } });
      const elsewhere = await snapshotOf(problems, fixture, SECOND, 'snapshot elsewhere');
      if (review === undefined || elsewhere === undefined) return problems;
      expectSame(problems, 'same bytes elsewhere', sameBytes(elsewhere.content, first.content), true);
      await fixture.commitAll(FIRST, 'empty');
      const recommitted = await snapshotOf(problems, fixture, FIRST, 'snapshot after an empty commit');
      if (recommitted === undefined) return problems;
      expectSame(problems, 'other commit, same tree', [recommitted.head.commit !== first.head.commit, recommitted.head.tree === first.head.tree], [true, true]);
      expectSame(problems, 'same bytes for the same tree', sameBytes(recommitted.content, first.content), true);
      await fixture.writeFile(FIRST, 'untracked.txt', 'untracked\n');
      expectReason(problems, 'dirty', await fixture.provider.snapshot(FIRST), 'precondition-failed', 'workspace-dirty');
      await fixture.commitAll(FIRST, 'more');
      const changed = await snapshotOf(problems, fixture, FIRST, 'snapshot after a change');
      if (changed !== undefined) expectSame(problems, 'other bytes', sameBytes(changed.content, first.content), false);
      return problems;
    },
  },
];

const CLEANUP: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'removes only its own clean workspace, keeps a dirty one, and never a control record',
    async check(fixture) {
      const problems: string[] = [];
      const before = await fixture.controlRecords();
      if ((await prepared(problems, fixture)) === undefined) return problems;
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      // An ignored link leaves the workspace clean.
      await fixture.linkToControlRecord(FIRST, fixture.ignoredPath);
      await expectDirty(problems, fixture, FIRST, []);
      await fixture.writeFile(SECOND, 'unsaved.txt', 'unsaved\n');
      expectReason(problems, 'remove a dirty workspace', await fixture.provider.remove(SECOND), 'precondition-failed', 'workspace-dirty');
      await expectDirty(problems, fixture, SECOND, ['untracked']);
      expectSuccess(problems, 'remove', await fixture.provider.remove(FIRST));
      expectSuccess(problems, 'remove again', await fixture.provider.remove(FIRST));
      expectCode(problems, 'removed', await fixture.provider.inspect(FIRST), 'not-found');
      expectSame(problems, 'listed', await fixture.provider.list(), [SECOND]);
      expectSame(problems, 'control records', await fixture.controlRecords(), before);
      return problems;
    },
  },
  {
    name: 'sweeps interrupted prepares and removals without following links, across a restart',
    async check(fixture) {
      const problems: string[] = [];
      const before = await fixture.controlRecords();
      if ((await prepared(problems, fixture)) === undefined) return problems;
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      // A committed link leaves the workspace clean, as a removal needs.
      await fixture.linkToControlRecord(FIRST, 'link-to-record');
      await fixture.commitAll(FIRST, 'link');
      await expectDirty(problems, fixture, FIRST, []);
      await fixture.interruptRemove(FIRST);
      await fixture.interruptPrepare(THIRD);
      await fixture.leaveLinkedLeftover(attempt('attempt-4'));
      const restarted = fixture.reopen();
      expectSame(problems, 'listed after restart', await restarted.list(), [SECOND]);
      await restarted.sweep();
      expectSame(problems, 'leftovers', await fixture.leftovers(), []);
      expectSame(problems, 'control records', await fixture.controlRecords(), before);
      expectSame(problems, 'listed after sweep', await restarted.list(), [SECOND]);
      expectSuccess(problems, 'kept across restart', await restarted.inspect(SECOND));
      expectSuccess(problems, 'prepare after sweep', await restarted.prepare(request(fixture, { attemptId: THIRD })));
      return problems;
    },
  },
];

export const WORKSPACE_CONFORMANCE: readonly ConformanceCase<WorkspaceFixture>[] = Object.freeze([
  ...WORKSPACE_PREPARATION,
  ...CREDENTIAL_USE,
  ...HEAD_STATE,
  ...PUSHES,
  ...SNAPSHOTS,
  ...CLEANUP,
]);
