import { parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import { expectCode, expectSame, expectSuccess, type ConformanceCase, type ProjectId, type TaskId } from '@taskelith/sdlc';
import { isSameCodeHead, parseGitObjectId, type CodeHeadIdentity, type GitObjectId, type RepositoryId } from '../domain/code-head.js';
import type { Workspace, WorkspaceCredential, WorkspaceStatus, WorkspaceTarget } from '../domain/workspace.js';
import type { WorkspaceFixture } from './workspace-fixture.js';
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
const UNKNOWN_COMMIT = must(parseGitObjectId('0'.repeat(40)));
const TASK_BRANCH_TARGET: WorkspaceTarget = Object.freeze({ kind: 'task-branch' });

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

async function prepared(problems: string[], fixture: WorkspaceFixture, overrides: Partial<PrepareWorkspace> = {}) {
  return value(problems, `prepare ${overrides.attemptId ?? FIRST}`, await fixture.provider.prepare(request(fixture, overrides)));
}

async function status(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId): Promise<WorkspaceStatus | undefined> {
  return value(problems, `inspect ${attemptId}`, await fixture.provider.inspect(attemptId));
}

async function expectDirty(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId, reasons: readonly string[]) {
  const current = await status(problems, fixture, attemptId);
  if (current !== undefined) expectSame(problems, `dirty reasons of ${attemptId}`, current.dirtyReasons, reasons);
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
      expectCode(problems, 'prepare again', await fixture.provider.prepare(request(fixture)), 'conflict');
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
      expectCode(problems, 'push from a review workspace', await fixture.provider.push(push), 'invalid');
      return problems;
    },
  },
  {
    name: 'rejects unsafe names, foreign heads, and missing sources, leaving nothing',
    async check(fixture) {
      const problems: string[] = [];
      const foreignRepository = id('RepositoryId', `${fixture.binding.repository}-other`) as RepositoryId;
      const commit = await fixture.remoteHead(fixture.binding.baseBranch);
      const known = must(parseGitObjectId(commit ?? ''));
      const head = (repository: RepositoryId, at: GitObjectId) => ({ repository, commit: at, tree: at });
      const cases: [string, Partial<PrepareWorkspace>, string][] = [
        ['unsafe attempt', { attemptId: attempt('../attempt') }, 'invalid'],
        ['unsafe task', { taskId: id('TaskId', 'task/1') as TaskId }, 'invalid'],
        ['foreign head', { target: { kind: 'at-head', head: head(foreignRepository, known) } }, 'invalid'],
        ['unknown head', { target: { kind: 'at-head', head: head(fixture.binding.repository, UNKNOWN_COMMIT) } }, 'not-found'],
        ['missing base', { binding: { ...fixture.binding, baseBranch: 'missing-base' } }, 'not-found'],
      ];
      for (const [label, overrides, code] of cases) expectCode(problems, label, await fixture.provider.prepare(request(fixture, overrides)), code);
      expectSame(problems, 'listed', await fixture.provider.list(), []);
      expectSame(problems, 'leftovers', await fixture.leftovers(), []);
      expectCode(problems, 'unsafe removal', await fixture.provider.remove(attempt('..')), 'invalid');
      return problems;
    },
  },
];

const CREDENTIAL_USE: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'uses a run credential only within its scope and never stores it',
    async check(fixture) {
      const problems: string[] = [];
      const { read, write, foreign } = fixture.credentials;
      expectCode(problems, 'foreign credential', await fixture.provider.prepare(request(fixture, { credential: foreign })), 'forbidden');
      if ((await prepared(problems, fixture)) === undefined) return problems;
      await fixture.writeFile(FIRST, 'change.txt', 'change\n');
      await fixture.commitAll(FIRST, 'change');
      const push = { attemptId: FIRST, expectedRemoteHead: null };
      expectCode(problems, 'push with read-only', await fixture.provider.push({ ...push, credential: read }), 'forbidden');
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
    name: 'pushes a clean task branch fast-forward at the expected remote head only',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      const base = await fixture.remoteHead(fixture.binding.baseBranch);
      const credential = fixture.credentials.write;
      await fixture.writeFile(FIRST, 'new.txt', 'new\n');
      expectCode(problems, 'dirty', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null }), 'precondition-failed');
      await fixture.commitAll(FIRST, 'first');
      expectCode(problems, 'wrong expectation', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: UNKNOWN_COMMIT }), 'conflict');
      const pushed = value(problems, 'push', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null }));
      const current = await status(problems, fixture, FIRST);
      if (pushed === undefined || current === undefined) return problems;
      sameHead(problems, 'pushed head', pushed, current.head);
      expectSame(problems, 'remote task branch', await fixture.remoteHead(TASK_BRANCH), pushed.commit);
      expectSame(problems, 'base unchanged', await fixture.remoteHead(fixture.binding.baseBranch), base);
      await fixture.advanceRemote(TASK_BRANCH);
      const moved = must(parseGitObjectId((await fixture.remoteHead(TASK_BRANCH)) ?? ''));
      await fixture.commitAll(FIRST, 'second');
      expectCode(problems, 'remote moved', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: pushed.commit }), 'conflict');
      expectCode(problems, 'not fast-forward', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: moved }), 'conflict');
      expectSame(problems, 'remote kept', await fixture.remoteHead(TASK_BRANCH), moved);
      return problems;
    },
  },
];

const SNAPSHOTS: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'snapshots only the clean head tree, in bytes that depend on the tree alone',
    async check(fixture) {
      const problems: string[] = [];
      const head = await pushedHead(problems, fixture, 'change.txt');
      if (head === undefined) return problems;
      await fixture.writeFile(FIRST, fixture.ignoredPath, 'ignored\n');
      const first = value(problems, 'snapshot', await fixture.provider.snapshot(FIRST));
      const review = await prepared(problems, fixture, { attemptId: SECOND, target: { kind: 'at-head', head } });
      const second = value(problems, 'snapshot elsewhere', await fixture.provider.snapshot(SECOND));
      if (first === undefined || second === undefined || review === undefined) return problems;
      sameHead(problems, 'snapshot head', first.head, head);
      expectSame(problems, 'same bytes', Array.from(first.content), Array.from(second.content));
      const files = await fixture.readSnapshot(first.content);
      expectSame(problems, 'committed file', files['change.txt'], 'change.txt content\n');
      expectSame(problems, 'ignored file', files[fixture.ignoredPath], undefined);
      await fixture.writeFile(FIRST, 'untracked.txt', 'untracked\n');
      expectCode(problems, 'dirty', await fixture.provider.snapshot(FIRST), 'precondition-failed');
      await fixture.commitAll(FIRST, 'more');
      const third = value(problems, 'snapshot after a change', await fixture.provider.snapshot(FIRST));
      if (third !== undefined) expectSame(problems, 'other bytes', Array.from(third.content).join() === Array.from(first.content).join(), false);
      return problems;
    },
  },
];

const CLEANUP: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'removes only its own workspace and never a control record',
    async check(fixture) {
      const problems: string[] = [];
      const before = await fixture.controlRecords();
      if ((await prepared(problems, fixture)) === undefined) return problems;
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      await fixture.linkToControlRecord(FIRST, 'link-to-record');
      expectSuccess(problems, 'remove', await fixture.provider.remove(FIRST));
      expectSuccess(problems, 'remove again', await fixture.provider.remove(FIRST));
      expectCode(problems, 'removed', await fixture.provider.inspect(FIRST), 'not-found');
      expectSame(problems, 'listed', await fixture.provider.list(), [SECOND]);
      expectSuccess(problems, 'other kept', await fixture.provider.inspect(SECOND));
      expectSame(problems, 'control records', await fixture.controlRecords(), before);
      return problems;
    },
  },
  {
    name: 'sweeps an interrupted prepare or removal and keeps workspaces across a restart',
    async check(fixture) {
      const problems: string[] = [];
      const before = await fixture.controlRecords();
      if ((await prepared(problems, fixture)) === undefined) return problems;
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      await fixture.interruptRemove(FIRST);
      await fixture.interruptPrepare(attempt('attempt-3'));
      const restarted = fixture.reopen();
      expectSame(problems, 'listed after restart', await restarted.list(), [SECOND]);
      await restarted.sweep();
      expectSame(problems, 'leftovers', await fixture.leftovers(), []);
      expectSuccess(problems, 'kept across restart', await restarted.inspect(SECOND));
      expectSuccess(problems, 'prepare after sweep', await restarted.prepare(request(fixture, { attemptId: attempt('attempt-3') })));
      expectSame(problems, 'control records', await fixture.controlRecords(), before);
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
