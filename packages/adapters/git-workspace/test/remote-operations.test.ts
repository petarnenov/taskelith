import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { failed, id, value } from '@taskelith/testing';
import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import { GitWorkspaces, credentialForms, sha256IdentifierDigest } from '@taskelith/git-workspace';
import {
  REDACTED_VALUE,
  WORKSPACE_LAYOUT,
  taskBranchName,
  type GitObjectId,
  type GitProcessObservation,
  type PrepareWorkspace,
  type WorkspaceCredential,
} from '@taskelith/workspace';
import { ManualGitTimer, within, createGitFixture, nativeGit, type GitFixture, type GitService, type SmartHttpRemote } from './git-fixture.ts';

const FIRST = id('AttemptId', 'attempt-1') as AttemptId;
const SECOND = id('AttemptId', 'attempt-2') as AttemptId;
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const TASK = id('TaskId', 'task-1') as TaskId;
const BRANCH = taskBranchName(TASK, sha256IdentifierDigest);
// The bound a stalled process is armed with; the test fires it itself.
const SHORT_TIME_LIMIT_MS = 1_500;
// Wide slack for a loaded host; the awaited work takes milliseconds.
const WITHIN_MS = 30_000;

function request(git: GitFixture, overrides: Partial<PrepareWorkspace> = {}): PrepareWorkspace {
  const { binding, credentials } = git.fixture;
  return { attemptId: FIRST, projectId: PROJECT, taskId: TASK, binding, target: { kind: 'task-branch' }, credential: credentials.read, ...overrides };
}

async function withFixture(run: (git: GitFixture) => Promise<void>): Promise<void> {
  const git = await createGitFixture();
  try {
    await run(git);
  } finally {
    await git.dispose();
  }
}

async function committed(git: GitFixture, attemptId: AttemptId, file: string): Promise<void> {
  await git.fixture.writeFile(attemptId, file, `${file}\n`);
  await git.fixture.commitAll(attemptId, file);
}

const push = (git: GitFixture, expectedRemoteHead: GitObjectId | null) =>
  git.local.push({ attemptId: FIRST, credential: git.fixture.credentials.write, expectedRemoteHead });

const reason = (result: Result<unknown>) => {
  const failure = failed(result);
  return [failure.code, failure.details.reason];
};

const handOffRecord = (git: GitFixture, attemptId: AttemptId) => join(dirname(git.checkout(attemptId)), WORKSPACE_LAYOUT.handOffRecord);

// Waits on the condition, never a fixed time: the group's members exit
// and are reaped on their own after the kill.
async function groupGone(pgid: number): Promise<boolean> {
  const deadline = Date.now() + WITHIN_MS;
  for (;;) {
    try {
      process.kill(-pgid, 0);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
    if (Date.now() > deadline) return false;
    await new Promise((next) => setImmediate(next));
  }
}

const lastProcessOf = async (git: GitFixture, operation: string): Promise<GitProcessObservation> =>
  (await git.fixture.gitProcesses()).filter(({ argv }) => argv.includes(operation)).at(-1)!;

test('the remote head read checks the workspace, the kind, and the credential before any remote call', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const { read, foreign } = fixture.credentials;
  const base = value(await local.prepare(request(git)));
  value(await local.prepare(request(git, { attemptId: SECOND, target: { kind: 'at-head', head: base.head } })));
  const calls = git.remote.requests;
  const unknown = id('AttemptId', 'attempt-unknown') as AttemptId;
  assert.equal(failed(await local.readRemoteHead({ attemptId: unknown, credential: foreign })).code, 'not-found');
  assert.deepEqual(reason(await local.readRemoteHead({ attemptId: SECOND, credential: foreign })), ['invalid', 'read-only-workspace']);
  assert.deepEqual(reason(await local.readRemoteHead({ attemptId: FIRST, credential: foreign })), ['forbidden', 'credential-out-of-scope']);
  assert.equal(git.remote.requests, calls);
  await writeFile(handOffRecord(git, FIRST), '{}');
  assert.equal(value(await local.readRemoteHead({ attemptId: FIRST, credential: read })), null);
  assert.equal((await lastProcessOf(git, 'ls-remote')).cwd, '/');
}));

test('the push checks the workspace, the kind, the credential, and the hand-off before any remote call', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const { read, write, foreign } = fixture.credentials;
  const base = value(await local.prepare(request(git)));
  value(await local.prepare(request(git, { attemptId: SECOND, target: { kind: 'at-head', head: base.head } })));
  await committed(git, FIRST, 'change.txt');
  const calls = git.remote.requests;
  const pushWith = (attemptId: AttemptId, credential: WorkspaceCredential) => local.push({ attemptId, credential, expectedRemoteHead: null });
  assert.equal(failed(await pushWith(id('AttemptId', 'attempt-unknown') as AttemptId, foreign)).code, 'not-found');
  assert.deepEqual(reason(await pushWith(SECOND, foreign)), ['invalid', 'read-only-workspace']);
  assert.deepEqual(reason(await pushWith(FIRST, foreign)), ['forbidden', 'credential-out-of-scope']);
  assert.deepEqual(reason(await pushWith(FIRST, read)), ['forbidden', 'credential-out-of-scope']);
  await writeFile(handOffRecord(git, FIRST), '{}');
  assert.deepEqual(reason(await pushWith(FIRST, write)), ['precondition-failed', 'workspace-handed-off']);
  assert.equal(git.remote.requests, calls);
  assert.equal(await fixture.remoteHead(BRANCH), undefined);
}));

test('a remote that moves between the head read and the push fails the lease as remote-moved', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'change.txt');
  let advanced = false;
  git.remote.beforeAnswer = async ({ url }) => {
    if (advanced || !url.includes('service=git-receive-pack')) return;
    advanced = true;
    await fixture.advanceRemote(BRANCH);
  };
  assert.deepEqual(reason(await push(git, null)), ['conflict', 'remote-moved']);
  const moved = await fixture.remoteHead(BRANCH);
  assert.equal(advanced, true);
  assert.notEqual(moved, undefined);
  assert.equal((await fixture.gitProcesses()).filter(({ argv }) => argv.includes('push')).length, 1, 'the push itself ran');
  assert.equal(await fixture.remoteHead(BRANCH), moved);
}));

test('a push whose transport fails with the remote unchanged is unavailable', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'change.txt');
  const other = await git.startOtherRemote();
  git.remote.behavior = { kind: 'redirect', origin: other.origin, service: 'git-receive-pack', request: 'service' };
  assert.equal(failed(await push(git, null)).code, 'unavailable');
  assert.equal(await fixture.remoteHead(BRANCH), undefined);
}));

test('a push descends from the expected head through verified commits, several generations deep', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'first.txt');
  const first = value(await push(git, null));
  for (const file of ['second.txt', 'third.txt', 'fourth.txt']) await committed(git, FIRST, file);
  const fourth = value(await push(git, first.commit));
  assert.equal(await fixture.remoteHead(BRANCH), fourth.commit);
}));

test('a push beside an expected head that the clone holds is not a fast-forward', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'first.txt');
  const first = value(await push(git, null));
  await nativeGit(git.checkout(FIRST), ['reset', '--quiet', '--hard', 'HEAD~1']);
  await committed(git, FIRST, 'other.txt');
  await committed(git, FIRST, 'more.txt');
  assert.deepEqual(reason(await push(git, first.commit)), ['conflict', 'not-fast-forward']);
  assert.equal(await fixture.remoteHead(BRANCH), first.commit);
}));

// Each operation that reaches the remote, by the service it uses.
const REDIRECTED: readonly [string, GitService, (git: GitFixture) => Promise<Result<unknown>>][] = [
  ['prepare', 'git-upload-pack', (git) => git.local.prepare(request(git, { attemptId: SECOND }))],
  ['readRemoteHead', 'git-upload-pack', (git) => git.local.readRemoteHead({ attemptId: FIRST, credential: git.fixture.credentials.read })],
  ['push', 'git-receive-pack', (git) => push(git, null)],
];

for (const [operation, service, run] of REDIRECTED) {
  for (const kind of ['advertisement', 'service'] as const) {
    test(`a ${operation} whose ${kind} request is redirected to another origin sends that origin nothing`, () => withFixture(async (git) => {
      const { fixture, local } = git;
      value(await local.prepare(request(git)));
      await committed(git, FIRST, 'change.txt');
      const other = await git.startOtherRemote();
      git.remote.behavior = { kind: 'redirect', origin: other.origin, service, request: kind };
      const result = await run(git);
      assert.equal(failed(result).code, 'unavailable');
      assert.equal(other.requests, 0, 'the other origin received a request');
      assert.ok(git.remote.received.some(({ url }) => url.includes(service) && url.includes('/info/refs') === (kind === 'advertisement')), 'the redirect was reached');
      assert.equal(await fixture.remoteHead(BRANCH), undefined);
    }));
  }
}

test('a planted remote URL, push URL, or rewrite never takes the credential elsewhere', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'change.txt');
  const other: SmartHttpRemote = await git.startOtherRemote();
  const planted: [string, string][] = [
    ['remote.origin.url', other.url('acme/project.git')],
    ['remote.origin.pushurl', other.url('acme/project.git')],
    ['remote.pushDefault', 'origin'],
    [`branch.${BRANCH}.remote`, 'origin'],
    [`url.${other.origin}/.insteadOf`, `${git.remote.origin}/`],
  ];
  for (const [key, setting] of planted) await fixture.plantGitSetting(FIRST, key, setting);
  assert.equal(value(await local.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.read })), null);
  const pushed = value(await push(git, null));
  assert.equal(await fixture.remoteHead(BRANCH), pushed.commit);
  assert.equal(other.requests, 0);
  assert.equal((await fixture.gitConfig(FIRST)).includes(other.origin), false);
}));

// Every form of every fixture credential, however short.
const formsOf = (git: GitFixture) => Object.values(git.fixture.credentials).flatMap(credentialForms);
const holdsAny = (text: string, forms: readonly string[]) => forms.some((form) => text.includes(form));

test('no credential form reaches an argument, another variable, a header, or a URL', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const { read, write } = fixture.credentials;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'change.txt');
  value(await local.readRemoteHead({ attemptId: FIRST, credential: read }));
  value(await push(git, null));
  const forms = formsOf(git);
  for (const process of await fixture.gitProcesses()) {
    assert.equal(process.argv.some((arg) => holdsAny(arg, forms)), false, `an argument of ${process.argv[1]}`);
    const values = Object.values(process.environment).filter((text) => !text.startsWith('<redacted-header'));
    assert.equal(values.some((text) => text === REDACTED_VALUE || holdsAny(text, forms)), false, `a variable of ${process.argv[1]}`);
  }
  const authorizations = new Set([read.authorization, write.authorization]);
  for (const { url, headers } of git.remote.received) {
    assert.equal(authorizations.has(headers.authorization ?? ''), true, `the header of ${url}`);
    const others = Object.entries(headers).filter(([name]) => name !== 'authorization').map(([, text]) => String(text));
    assert.equal([url, ...others].some((text) => holdsAny(text, forms)), false, `another header of ${url}`);
  }
}));

test('an error message that repeats the header is scrubbed of every credential form', () => withFixture(async (git) => {
  const { local } = git;
  value(await local.prepare(request(git)));
  await committed(git, FIRST, 'change.txt');
  git.remote.behavior = { kind: 'echo-authorization' };
  const forms = formsOf(git);
  const failures = [
    failed(await local.prepare(request(git, { attemptId: SECOND }))),
    failed(await local.readRemoteHead({ attemptId: FIRST, credential: git.fixture.credentials.read })),
    failed(await push(git, null)),
  ];
  for (const failure of failures) {
    assert.equal(failure.code, 'unavailable');
    assert.ok(failure.message.includes(REDACTED_VALUE), `Git repeated the header: ${failure.message}`);
    assert.equal(holdsAny(failure.message, forms), false);
  }
}));

// The stalled operation runs alone under a time limit that the test fires
// once the remote received the request, so no host speed matters.
for (const operation of ['readRemoteHead', 'prepare'] as const) {
  test(`a stalled remote fails ${operation} as unavailable at the time limit and kills its process group`, () => withFixture(async (git) => {
    const { fixture } = git;
    value(await git.local.prepare(request(git)));
    const timer = new ManualGitTimer();
    const options = { dataRoot: fixture.dataRoot, client: git.client, remoteTransport: 'https-or-loopback-http' as const };
    const limited = new GitWorkspaces({ ...options, gitTimeLimitMs: SHORT_TIME_LIMIT_MS, gitTimer: timer.timer });
    const reached = new Promise<void>((received) => (git.remote.beforeAnswer = async () => received()));
    git.remote.behavior = { kind: 'stall' };
    const recorded = (await fixture.gitProcesses()).length;
    const running: Promise<Result<unknown>> = operation === 'prepare'
      ? limited.prepare(request(git, { attemptId: SECOND }))
      : limited.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.read });
    try {
      await within(reached, WITHIN_MS);
      timer.expire();
      const failure = failed(await within(running, WITHIN_MS));
      assert.equal(failure.code, 'unavailable');
      assert.equal(timer.limits.at(-1), SHORT_TIME_LIMIT_MS);
      assert.match(failure.message, new RegExp(`longer than ${SHORT_TIME_LIMIT_MS} ms`));
      const [stalled] = (await fixture.gitProcesses()).slice(recorded);
      assert.ok(stalled?.argv.includes(operation === 'prepare' ? 'clone' : 'ls-remote'));
      assert.equal(await groupGone(stalled!.pid), true, 'a process of the group survived');
      assert.deepEqual([await git.local.list(), await fixture.leftovers()], [[FIRST], []]);
    } finally {
      timer.expire();
      await running.catch(() => {});
    }
  }));
}

test('a short read secret that matches the task branch ref still reads the remote head', async () => {
  const git = await createGitFixture({ readSecret: 'task' });
  try {
    const read = git.fixture.credentials.read;
    assert.equal(BRANCH.includes(read.secret), true);
    value(await git.local.prepare(request(git)));
    await committed(git, FIRST, 'change.txt');
    const pushed = value(await push(git, null));
    assert.equal(value(await git.local.readRemoteHead({ attemptId: FIRST, credential: read })), pushed.commit);
  } finally {
    await git.dispose();
  }
});
