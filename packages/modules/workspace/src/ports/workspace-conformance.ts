import { parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import { expectCode, expectSame, expectSuccess, type ConformanceCase, type ProjectId, type TaskId } from '@taskelith/sdlc';
import { isSameCodeHead, parseGitObjectId, type CodeHeadIdentity, type GitObjectId, type RepositoryId } from '../domain/code-head.js';
import { GIT_NEUTRAL_DIRECTORY } from '../domain/git-client.js';
import { HEAD_SNAPSHOT_CONTENT_TYPE, encodeHeadSnapshot } from '../domain/snapshot-archive.js';
import {
  WORKSPACE_LAYOUT,
  taskBranchName,
  taskBranchPushArguments,
  workspaceDirectoryName,
  type HeadSnapshot,
  type TreeEntry,
  type Workspace,
  type WorkspaceCredential,
  type WorkspaceStatus,
  type WorkspaceTarget,
} from '../domain/workspace.js';
import { gitProcessProblems, holdsSensitive, operationOf, pushArgumentProblems, sensitiveValues } from './git-process-checks.js';
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
const FIRST = attempt('attempt-1');
const SECOND = attempt('attempt-2');
const THIRD = attempt('attempt-3');
const UNKNOWN_COMMIT = must(parseGitObjectId('0'.repeat(40)));
const TASK_BRANCH_TARGET: WorkspaceTarget = Object.freeze({ kind: 'task-branch' });
// Bytes that are not valid UTF-8, so a text round trip would change them.
const taskBranch = (fixture: WorkspaceFixture) => taskBranchName(TASK, fixture.identifierDigest);
// SHA-256 vectors: FIPS 180-2 "abc", the empty input, and a UTF-8 one.
const DIGEST_VECTORS = [
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['café/ü', '918664c864dbe6fd7343a3870228e439ac88c05dfeb5c52de793f0662f5325ce'],
] as const;
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
  return credentials.filter((credential) => holdsSensitive(text, sensitiveValues([credential]))).map((credential) => credential.credentialId);
}

const fixtureSensitive = ({ credentials }: WorkspaceFixture) => sensitiveValues([credentials.read, credentials.write, credentials.foreign]);

function sameHead(problems: string[], label: string, actual: CodeHeadIdentity | undefined, expected: CodeHeadIdentity) {
  if (actual === undefined || !isSameCodeHead(actual, expected)) problems.push(`${label}: expected the same code head`);
}

// Refused before the credential check and before any remote call.
async function expectInsecureRemotesRefused(problems: string[], fixture: WorkspaceFixture): Promise<void> {
  const { read, foreign } = fixture.credentials;
  const remotes: [string, string, WorkspaceCredential][] = [
    ['plain HTTP remote', 'http://scm.example/acme/project.git', read],
    ['remote with a user', 'https://agent@scm.example/acme/project.git', read],
    ['plain HTTP remote with a foreign credential', 'http://scm.example/acme/project.git', foreign],
  ];
  for (const [label, remote, credential] of remotes) {
    const calls = await fixture.remoteCalls();
    const result = await fixture.provider.prepare(request(fixture, { binding: { ...fixture.binding, remote }, credential }));
    expectReason(problems, label, result, 'invalid', 'insecure-remote');
    expectSame(problems, `${label}: remote calls`, await fixture.remoteCalls(), calls);
  }
}

const WORKSPACE_PREPARATION: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'prepares a task branch workspace at the base head',
    async check(fixture) {
      const problems: string[] = [];
      const workspace = await prepared(problems, fixture);
      if (workspace === undefined) return problems;
      const expected: Partial<Workspace> = { attemptId: FIRST, projectId: PROJECT, taskId: TASK, kind: 'task-branch', branch: taskBranch(fixture) };
      expectSame(problems, 'record', { ...workspace, workingDirectory: undefined, head: undefined }, expected);
      expectSame(problems, 'repository', workspace.head.repository, fixture.binding.repository);
      expectSame(problems, 'base head', workspace.head.commit, await fixture.remoteHead(fixture.binding.baseBranch));
      expectSame(problems, 'status', await fixture.provider.inspect(FIRST), { ok: true, value: { head: workspace.head, branch: taskBranch(fixture), dirtyReasons: [] } });
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
      await fixture.advanceRemote(taskBranch(fixture));
      const workspace = await prepared(problems, fixture);
      if (workspace !== undefined) expectSame(problems, 'task head', workspace.head.commit, await fixture.remoteHead(taskBranch(fixture)));
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
    name: 'rejects foreign or mismatched heads and missing sources, leaving nothing',
    async check(fixture) {
      const problems: string[] = [];
      const base = await prepared(problems, fixture, { attemptId: THIRD });
      if (base === undefined) return problems;
      expectSuccess(problems, 'remove the probe', await fixture.provider.remove(THIRD));
      const foreignRepository = id('RepositoryId', `${fixture.binding.repository}-other`) as RepositoryId;
      const { commit, tree } = base.head;
      const at = (head: CodeHeadIdentity): Partial<PrepareWorkspace> => ({ target: { kind: 'at-head', head } });
      const cases: [string, Partial<PrepareWorkspace>, string, string | undefined][] = [
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
      await expectInsecureRemotesRefused(problems, fixture);
      expectSame(problems, 'listed', await fixture.provider.list(), []);
      expectSame(problems, 'leftovers', await fixture.leftovers(), []);
      return problems;
    },
  },
  {
    name: 'names workspaces with SHA-256 of the identifier in lowercase hexadecimal',
    async check(fixture) {
      const problems: string[] = [];
      for (const [input, digest] of DIGEST_VECTORS) {
        expectSame(problems, `digest of "${input}"`, fixture.identifierDigest(input), digest);
      }
      return problems;
    },
  },
  {
    name: 'derives distinct workspace names and task branches from any identifiers',
    async check(fixture) {
      const problems: string[] = [];
      const named = [['../attempt', 'feature/login'], ['a/b', 'a/b'], ['a_b', 'a_b'], ['..', 'v1.2']] as const;
      const workspaces: Workspace[] = [];
      for (const [attemptText, taskText] of named) {
        const attemptId = attempt(attemptText);
        const taskId = id('TaskId', taskText) as TaskId;
        const workspace = await prepared(problems, fixture, { attemptId, taskId });
        if (workspace === undefined) return problems;
        expectSame(problems, `branch of ${taskText}`, workspace.branch, taskBranchName(taskId, fixture.identifierDigest));
        const directory = [fixture.dataRoot, WORKSPACE_LAYOUT.root, workspaceDirectoryName(attemptId, fixture.identifierDigest), WORKSPACE_LAYOUT.checkout].join('/');
        expectSame(problems, `working directory of ${attemptText}`, workspace.workingDirectory, directory);
        workspaces.push(workspace);
      }
      expectSame(problems, 'distinct branches', new Set(workspaces.map(({ branch }) => branch)).size, named.length);
      const review = { attemptId: attempt('../review'), taskId: id('TaskId', '../unsafe') as TaskId };
      const atHead = { ...review, target: { kind: 'at-head', head: workspaces[0]!.head }, credential: fixture.credentials.foreign } as const;
      const refused = await fixture.provider.prepare(request(fixture, atHead));
      expectReason(problems, 'unsafe task at a head', refused, 'forbidden', 'credential-out-of-scope');
      expectSame(problems, 'listed', await fixture.provider.list(), named.map(([text]) => text).sort());
      const [first, ...rest] = named.map(([text]) => attempt(text));
      expectSuccess(problems, `remove ${first}`, await fixture.provider.remove(first!));
      expectSame(problems, 'listed after one removal', await fixture.provider.list(), ['..', 'a/b', 'a_b']);
      for (const attemptId of rest) expectSuccess(problems, `remove ${attemptId}`, await fixture.provider.remove(attemptId));
      expectSame(problems, 'listed after every removal', await fixture.provider.list(), []);
      expectSame(problems, 'leftovers', await fixture.leftovers(), []);
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
      expectSame(problems, 'nothing pushed', await fixture.remoteHead(taskBranch(fixture)), undefined);
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
      expectSame(problems, 'nothing pushed', await fixture.remoteHead(taskBranch(fixture)), undefined);
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

// The one push since `since`: exactly the leased push of contract
// section 8 to the binding's remote, so no option can cancel the lease.
async function expectLeasedPush(problems: string[], fixture: WorkspaceFixture, since: number, expected: string | null) {
  const pushes = (await fixture.gitProcesses()).slice(since).filter(({ argv }) => operationOf(argv) === 'push');
  if (pushes.length !== 1) {
    problems.push(`push processes: expected 1, got ${pushes.length}`);
    return;
  }
  const arguments_ = taskBranchPushArguments(taskBranch(fixture), expected, fixture.binding.remote);
  problems.push(...pushArgumentProblems(pushes[0]!, arguments_, fixtureSensitive(fixture)));
}

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
      expectSame(problems, 'remote task branch', await fixture.remoteHead(taskBranch(fixture)), pushed.commit);
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
      await fixture.advanceRemote(taskBranch(fixture));
      await fixture.writeFile(SECOND, 'third.txt', 'third\n');
      await fixture.commitAll(SECOND, 'third');
      const stale = await fixture.provider.push({ ...next, expectedRemoteHead: second.commit });
      expectReason(problems, 'remote moved', stale, 'conflict', 'remote-moved');
      const moved = await remoteHead(problems, fixture, SECOND);
      expectSame(problems, 'moved remote head', moved, await fixture.remoteHead(taskBranch(fixture)));
      const diverged = await fixture.provider.push({ ...next, expectedRemoteHead: moved ?? null });
      expectReason(problems, 'not fast-forward', diverged, 'conflict', 'not-fast-forward');
      expectSame(problems, 'remote kept', await fixture.remoteHead(taskBranch(fixture)), moved);
      return problems;
    },
  },
  {
    name: 'refuses a push whose remote task branch moved, and leaves the remote where it is',
    async check(fixture) {
      const problems: string[] = [];
      const credential = fixture.credentials.write;
      if ((await prepared(problems, fixture)) === undefined) return problems;
      await fixture.writeFile(FIRST, 'first.txt', 'first\n');
      await fixture.commitAll(FIRST, 'first');
      // Another party creates the branch after the caller saw it absent.
      await fixture.advanceRemote(taskBranch(fixture));
      const created = await fixture.remoteHead(taskBranch(fixture));
      const absent = await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null });
      expectReason(problems, 'push expecting no branch', absent, 'conflict', 'remote-moved');
      expectSame(problems, 'remote after expecting no branch', await fixture.remoteHead(taskBranch(fixture)), created);
      if ((await prepared(problems, fixture, { attemptId: SECOND })) === undefined) return problems;
      await fixture.writeFile(SECOND, 'second.txt', 'second\n');
      await fixture.commitAll(SECOND, 'second');
      const expected = (await remoteHead(problems, fixture, SECOND)) ?? null;
      const since = (await fixture.gitProcesses()).length;
      const pushed = value(problems, 'leased push', await fixture.provider.push({ attemptId: SECOND, credential, expectedRemoteHead: expected }));
      if (pushed === undefined) return problems;
      await expectLeasedPush(problems, fixture, since, expected);
      await fixture.advanceRemote(taskBranch(fixture));
      const moved = await fixture.remoteHead(taskBranch(fixture));
      await fixture.writeFile(SECOND, 'third.txt', 'third\n');
      await fixture.commitAll(SECOND, 'third');
      const stale = await fixture.provider.push({ attemptId: SECOND, credential, expectedRemoteHead: pushed.commit });
      expectReason(problems, 'push expecting a moved head', stale, 'conflict', 'remote-moved');
      expectSame(problems, 'remote after expecting a moved head', await fixture.remoteHead(taskBranch(fixture)), moved);
      return problems;
    },
  },
  {
    name: 'refuses a push that does not descend from the remote head, and leaves the remote where it is',
    async check(fixture) {
      const problems: string[] = [];
      const credential = fixture.credentials.write;
      if ((await prepared(problems, fixture)) === undefined) return problems;
      await fixture.writeFile(FIRST, 'first.txt', 'first\n');
      await fixture.commitAll(FIRST, 'first');
      const since = (await fixture.gitProcesses()).length;
      const first = await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null });
      if (value(problems, 'first push', first) === undefined) return problems;
      await expectLeasedPush(problems, fixture, since, null);
      await fixture.advanceRemote(taskBranch(fixture));
      await fixture.writeFile(FIRST, 'local.txt', 'local\n');
      await fixture.commitAll(FIRST, 'local');
      const expected = (await remoteHead(problems, fixture, FIRST)) ?? null;
      expectSame(problems, 'remote head the port reports', expected, await fixture.remoteHead(taskBranch(fixture)));
      const diverged = await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: expected });
      expectReason(problems, 'push beside the remote head', diverged, 'conflict', 'not-fast-forward');
      expectSame(problems, 'remote after the refusal', await fixture.remoteHead(taskBranch(fixture)) ?? null, expected);
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
      await fixture.writeFile(FIRST, '__proto__', 'proto\n');
      await fixture.commitAll(FIRST, 'tree');
      const credential = fixture.credentials.write;
      // Published, so that a fresh clone can open the same head.
      const pushed = value(problems, 'push', await fixture.provider.push({ attemptId: FIRST, credential, expectedRemoteHead: null }));
      await fixture.writeFile(FIRST, fixture.ignoredPath, 'ignored\n');
      const first = await snapshotOf(problems, fixture, FIRST, 'snapshot');
      if (first === undefined || pushed === undefined) return problems;
      sameHead(problems, 'snapshot of the pushed head', first.head, pushed);
      expectSame(problems, 'content type', first.contentType, HEAD_SNAPSHOT_CONTENT_TYPE);
      const expected = sortedTree({
        ...fixture.baseTree,
        'change.txt': { type: 'file', mode: '100644', content: text('change\n') },
        'run.sh': { type: 'file', mode: '100755', content: text('echo run\n') },
        'blob.bin': { type: 'file', mode: '100644', content: BINARY },
        latest: { type: 'link', target: 'change.txt' },
        ['__proto__']: { type: 'file', mode: '100644', content: text('proto\n') },
      });
      const decoded = await fixture.readSnapshot(first.content);
      expectSame(problems, 'tree', sortedTree(decoded), expected);
      const encoded = encodeHeadSnapshot(new Map(Object.entries(decoded)));
      expectSame(problems, 'bytes of the contract format', encoded.ok && sameBytes(encoded.value, first.content), true);
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
  {
    name: 'refuses to snapshot a tree that holds a gitlink',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      await fixture.commitGitlink(FIRST, 'vendor/module');
      await expectDirty(problems, fixture, FIRST, []);
      expectReason(problems, 'snapshot', await fixture.provider.snapshot(FIRST), 'precondition-failed', 'gitlink-in-tree');
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

// An at-head workspace stays read-only while handed off.
async function expectReadOnlyWhileHandedOff(problems: string[], fixture: WorkspaceFixture, head: CodeHeadIdentity) {
  const { provider } = fixture;
  if ((await prepared(problems, fixture, { attemptId: THIRD, target: { kind: 'at-head', head } })) === undefined) return;
  expectSuccess(problems, 'hand off at a head', await provider.handOff(THIRD));
  const pushed = await provider.push({ attemptId: THIRD, credential: fixture.credentials.write, expectedRemoteHead: null });
  expectReason(problems, 'push at a head while handed off', pushed, 'invalid', 'read-only-workspace');
}

async function expectUnsafeCheckout(problems: string[], fixture: WorkspaceFixture, attemptId: AttemptId) {
  const { provider, credentials } = fixture;
  const refusals: [string, Result<unknown>][] = [
    ['inspect', await provider.inspect(attemptId)],
    ['snapshot', await provider.snapshot(attemptId)],
    ['push', await provider.push({ attemptId, credential: credentials.write, expectedRemoteHead: null })],
    ['remove', await provider.remove(attemptId)],
  ];
  for (const [label, result] of refusals) {
    expectReason(problems, `${label} of ${attemptId}`, result, 'precondition-failed', 'unsafe-checkout');
  }
}

const HANDOFF: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'reads the handed-off workspaces from their records, also after a restart',
    async check(fixture) {
      const problems: string[] = [];
      const { provider } = fixture;
      for (const attemptId of [FIRST, SECOND]) {
        if ((await prepared(problems, fixture, { attemptId })) === undefined) return problems;
      }
      expectSame(problems, 'handed off before a hand-off', await provider.handedOff(), []);
      expectSuccess(problems, 'hand off', await provider.handOff(FIRST));
      expectSame(problems, 'handed off', await provider.handedOff(), [FIRST]);
      expectSame(problems, 'handed off after a restart', await fixture.reopen().handedOff(), [FIRST]);
      expectSuccess(problems, 'reclaim', await provider.reclaim(FIRST));
      expectSame(problems, 'handed off after the reclaim', await provider.handedOff(), []);
      expectSame(problems, 'listed', await provider.list(), [FIRST, SECOND]);
      return problems;
    },
  },
  {
    name: 'hands the checkout to the execution and takes it back without outside links',
    async check(fixture) {
      const problems: string[] = [];
      const { provider } = fixture;
      const workspace = await prepared(problems, fixture);
      if (workspace === undefined) return problems;
      expectSuccess(problems, 'hand off', await provider.handOff(FIRST));
      expectSuccess(problems, 'hand off again', await provider.handOff(FIRST));
      const { write, foreign } = fixture.credentials;
      const refusals: [string, Result<unknown>][] = [
        ['inspect', await provider.inspect(FIRST)],
        ['inspect after a restart', await fixture.reopen().inspect(FIRST)],
        ['snapshot', await provider.snapshot(FIRST)],
        ['push', await provider.push({ attemptId: FIRST, credential: write, expectedRemoteHead: null })],
        ['remove', await provider.remove(FIRST)],
      ];
      for (const [label, result] of refusals) {
        expectReason(problems, `${label} while handed off`, result, 'precondition-failed', 'workspace-handed-off');
      }
      // A removal that went through leaves nothing more to check.
      if (refusals.some(([, result]) => result.ok)) return problems;
      expectSame(problems, 'listed while handed off', await provider.list(), [FIRST]);
      // The kind and the credential are checked before the hand-off.
      const foreignPush = await provider.push({ attemptId: FIRST, credential: foreign, expectedRemoteHead: null });
      expectReason(problems, 'foreign push while handed off', foreignPush, 'forbidden', 'credential-out-of-scope');
      await fixture.writeFile(FIRST, fixture.trackedPath, 'agent\n');
      const writeOutside = await fixture.hardLinkOutside(FIRST, fixture.trackedPath);
      expectSuccess(problems, 'reclaim', await provider.reclaim(FIRST));
      expectSuccess(problems, 'reclaim again', await provider.reclaim(FIRST));
      await writeOutside('written from outside\n');
      expectSame(problems, 'outside write reaches the checkout', (await fixture.workspaceText(FIRST)).includes('written from outside'), false);
      await expectDirty(problems, fixture, FIRST, ['modified']);
      await expectReadOnlyWhileHandedOff(problems, fixture, workspace.head);
      expectCode(problems, 'hand off an absent workspace', await provider.handOff(SECOND), 'not-found');
      expectCode(problems, 'reclaim an absent workspace', await provider.reclaim(SECOND), 'not-found');
      return problems;
    },
  },
  {
    name: 'refuses Git work on a checkout whose Git directory holds a link, is gone, or is nested',
    async check(fixture) {
      const problems: string[] = [];
      const before = await fixture.controlRecords();
      const workspaces: Workspace[] = [];
      for (const attemptId of [FIRST, SECOND, THIRD]) {
        const workspace = await prepared(problems, fixture, { attemptId });
        if (workspace === undefined) return problems;
        workspaces.push(workspace);
      }
      await fixture.nestGitFile(THIRD, `${workspaces[0]!.workingDirectory}/.git`);
      await fixture.linkInGitDirectory(FIRST);
      await fixture.removeGitDirectory(SECOND);
      for (const attemptId of [FIRST, SECOND, THIRD]) await expectUnsafeCheckout(problems, fixture, attemptId);
      expectSame(problems, 'listed', await fixture.provider.list(), [FIRST, SECOND, THIRD]);
      expectSame(problems, 'control records', await fixture.controlRecords(), before);
      return problems;
    },
  },
  {
    name: 'holds one handed-off workspace at a time where executions share a separate account',
    async check(fixture) {
      const problems: string[] = [];
      if (!fixture.separateExecutionIdentity) return problems;
      const { provider } = fixture;
      for (const attemptId of [FIRST, SECOND]) {
        if ((await prepared(problems, fixture, { attemptId })) === undefined) return problems;
      }
      expectSuccess(problems, 'hand off', await provider.handOff(FIRST));
      expectSuccess(problems, 'hand off the same again', await provider.handOff(FIRST));
      const second = await provider.handOff(SECOND);
      expectReason(problems, 'second hand-off', second, 'precondition-failed', 'other-workspace-handed-off');
      const restarted = await fixture.reopen().handOff(SECOND);
      expectReason(problems, 'second hand-off after a restart', restarted, 'precondition-failed', 'other-workspace-handed-off');
      expectSuccess(problems, 'reclaim', await provider.reclaim(FIRST));
      expectSuccess(problems, 'hand off after the reclaim', await provider.handOff(SECOND));
      return problems;
    },
  },
  {
    name: 'lets one of two concurrent hand-offs through where executions share a separate account',
    async check(fixture) {
      const problems: string[] = [];
      if (!fixture.separateExecutionIdentity) return problems;
      const { provider } = fixture;
      for (const attemptId of [FIRST, SECOND]) {
        if ((await prepared(problems, fixture, { attemptId })) === undefined) return problems;
      }
      const results = await Promise.all([provider.handOff(FIRST), provider.handOff(SECOND)]);
      expectSame(problems, 'concurrent hand-offs that succeed', results.filter((result) => result.ok).length, 1);
      const refused = results.find((result) => !result.ok);
      if (refused !== undefined) {
        expectReason(problems, 'concurrent hand-off', refused, 'precondition-failed', 'other-workspace-handed-off');
      }
      return problems;
    },
  },
];

// Repository settings an agent plants; none may act on the adapter's Git.
const PLANTED_SETTINGS = [
  ['core.hooksPath', '/planted/hooks'],
  ['credential.helper', 'store --file /planted/credentials'],
  ['include.path', '/planted/include'],
  ['http.proxy', 'http://planted.example:3128'],
  ['remote.origin.pushurl', 'https://planted.example/push.git'],
  ['url.https://planted.example/.insteadOf', 'https://'],
] as const;

const GIT_USE: readonly ConformanceCase<WorkspaceFixture>[] = [
  {
    name: 'runs Git in an environment it builds, with no credential in an argument',
    async check(fixture) {
      const problems: string[] = [];
      const { provider, credentials } = fixture;
      // The credential each step passes, from its first process on.
      const steps: { readonly from: number; readonly credentialId: string | null }[] = [];
      const step = async <T>(credential: WorkspaceCredential | null, run: () => Promise<T>): Promise<T> => {
        steps.push({ from: (await fixture.gitProcesses()).length, credentialId: credential?.credentialId ?? null });
        return run();
      };
      if ((await step(credentials.read, () => prepared(problems, fixture))) === undefined) return problems;
      await fixture.writeFile(FIRST, 'change.txt', 'change\n');
      await fixture.commitAll(FIRST, 'change');
      value(problems, 'snapshot', await step(null, () => provider.snapshot(FIRST)));
      value(problems, 'remote head', await step(credentials.read, () => provider.readRemoteHead({ attemptId: FIRST, credential: credentials.read })));
      value(problems, 'push', await step(credentials.write, () => provider.push({ attemptId: FIRST, credential: credentials.write, expectedRemoteHead: null })));
      const processes = await fixture.gitProcesses();
      if (processes.length === 0) return [...problems, 'no Git process was observed'];
      const sensitive = fixtureSensitive(fixture);
      const reachesRemote = (argv: readonly string[]) => argv.includes(fixture.binding.remote);
      processes.forEach((process, index) => {
        const credentialId = [...steps].reverse().find(({ from }) => from <= index)?.credentialId ?? null;
        const expected = { credentialId: reachesRemote(process.argv) ? credentialId : null };
        problems.push(...gitProcessProblems(process, expected, sensitive));
      });
      const remote = processes.filter(({ argv }) => reachesRemote(argv));
      expectSame(problems, 'Git processes that reach the binding remote', remote.length >= 3, true);
      return problems;
    },
  },
  {
    name: 'writes the repository configuration anew, so settings the agent planted never act',
    async check(fixture) {
      const problems: string[] = [];
      const { provider } = fixture;
      if ((await prepared(problems, fixture)) === undefined) return problems;
      expectSuccess(problems, 'hand off', await provider.handOff(FIRST));
      for (const [key, setting] of PLANTED_SETTINGS) await fixture.plantGitSetting(FIRST, key, setting);
      await fixture.writeFile(FIRST, 'agent.txt', 'agent\n');
      const since = (await fixture.gitProcesses()).length;
      expectSuccess(problems, 'reclaim', await provider.reclaim(FIRST));
      await fixture.commitAll(FIRST, 'agent');
      const pushed = value(problems, 'push', await provider.push({ attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null }));
      if (pushed === undefined) return problems;
      expectSame(problems, 'planted settings left', (await fixture.gitConfig(FIRST)).includes('planted'), false);
      // A setting acts if a process starts with it, even if it is gone later.
      const planted = (await fixture.gitProcesses()).slice(since).filter(({ argv, repositoryConfig }) =>
        argv.some((arg) => arg.includes('planted')) || (repositoryConfig ?? '').includes('planted'));
      expectSame(problems, 'Git processes that started with a planted setting', planted.length, 0);
      await expectLeasedPush(problems, fixture, since, null);
      expectSame(problems, 'remote task branch', await fixture.remoteHead(taskBranch(fixture)), pushed.commit);
      return problems;
    },
  },
  {
    name: 'reads the remote head of a handed-off workspace outside every repository',
    async check(fixture) {
      const problems: string[] = [];
      if ((await prepared(problems, fixture)) === undefined) return problems;
      expectSuccess(problems, 'hand off', await fixture.provider.handOff(FIRST));
      for (const [key, setting] of PLANTED_SETTINGS) await fixture.plantGitSetting(FIRST, key, setting);
      const since = (await fixture.gitProcesses()).length;
      expectSame(problems, 'remote head', await remoteHead(problems, fixture, FIRST), null);
      const processes = (await fixture.gitProcesses()).slice(since);
      if (processes.length === 0) problems.push('no Git process read the remote head');
      const misplaced = processes.filter(({ cwd, repositoryConfig }) => cwd !== GIT_NEUTRAL_DIRECTORY || (repositoryConfig ?? '').includes('planted'));
      expectSame(problems, 'Git processes that started in a repository', misplaced.length, 0);
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
  ...HANDOFF,
  ...GIT_USE,
]);
