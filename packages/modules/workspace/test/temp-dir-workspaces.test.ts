import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { parseIdentifier, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import { WORKSPACE_LAYOUT, WORKSPACE_MODES, encodeHeadSnapshot, type PrepareWorkspace, type WorkspaceFixture } from '@taskelith/workspace';
import { CheckBarrier, createFixture, decodeTar, type TempDirWorkspaces } from './temp-dir-workspaces.ts';

// The double's own modes and records, which the suite cannot see through
// the port; the Linux checks with real accounts belong to item 16.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const FIRST = must(parseIdentifier('AttemptId', 'attempt-1')) as AttemptId;
const SECOND = must(parseIdentifier('AttemptId', 'attempt-2')) as AttemptId;

function request(fixture: WorkspaceFixture, overrides: Partial<PrepareWorkspace> = {}): PrepareWorkspace {
  return {
    attemptId: FIRST,
    projectId: must(parseIdentifier('ProjectId', 'project-1')) as ProjectId,
    taskId: must(parseIdentifier('TaskId', 'task-1')) as TaskId,
    binding: fixture.binding,
    target: { kind: 'task-branch' },
    credential: fixture.credentials.write,
    ...overrides,
  };
}

async function withFixture(use: (fixture: WorkspaceFixture, provider: TempDirWorkspaces) => Promise<void>): Promise<void> {
  const { fixture, dispose } = await createFixture();
  try {
    await use(fixture, fixture.provider as TempDirWorkspaces);
  } finally {
    await dispose();
  }
}

const modeOf = async (path: string) => (await stat(path)).mode & 0o7777;

test('a prepared workspace keeps its record closed and its checkout reclaimed', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  const attempt = dirname(checkout);
  assert.equal(await modeOf(attempt), WORKSPACE_MODES.attempt);
  assert.equal(await modeOf(join(attempt, WORKSPACE_LAYOUT.metadata)), WORKSPACE_MODES.metadata);
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
}));

// Linux directories inherit the set-group-ID bit; macOS ones do not.
const onLinux = { skip: process.platform !== 'linux' };

test('the clone writes into a checkout that is set-group-ID already', onLinux, () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  assert.equal((await modeOf(join(checkout, '.git'))) & 0o2000, 0o2000);
}));

test('a hand-off opens the checkout and a reclaim gives the group what the agent wrote', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  must(await provider.handOff(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutHandedOff);
  await mkdir(join(checkout, 'private'), { mode: 0o700 });
  await writeFile(join(checkout, 'private', 'note.txt'), 'note\n', { mode: 0o600 });
  await chmod(join(checkout, 'private', 'note.txt'), 0o600);
  must(await provider.reclaim(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
  assert.equal(await modeOf(join(checkout, 'private')), 0o2770);
  assert.equal(await modeOf(join(checkout, 'private', 'note.txt')), 0o660);
}));

test('a rewritten Git state in an at-head checkout cannot make it publish', () => withFixture(async (fixture, provider) => {
  const base = must(await provider.prepare(request(fixture))).head;
  const review = must(await provider.prepare(request(fixture, { attemptId: SECOND, target: { kind: 'at-head', head: base } })));
  const statePath = join(review.workingDirectory, '.git', 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
  const claimed = { ...state, kind: 'task-branch', expectedBranch: 'taskelith/task-1', branch: 'taskelith/task-1' };
  await writeFile(statePath, JSON.stringify(claimed));
  const credential = fixture.credentials.write;
  const read = await provider.readRemoteHead({ attemptId: SECOND, credential });
  const pushed = await provider.push({ attemptId: SECOND, credential, expectedRemoteHead: null });
  for (const result of [read, pushed]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.details.reason, 'read-only-workspace');
  }
}));

test('a hand-off survives a restart without a mode change, as on one account', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  must(await provider.handOff(FIRST));
  await chmod(checkout, WORKSPACE_MODES.checkoutReclaimed);
  const inspected = await fixture.reopen().inspect(FIRST);
  assert.equal(inspected.ok, false);
  if (!inspected.ok) assert.equal(inspected.error.details.reason, 'workspace-handed-off');
}));

test('a reclaim gives back files the agent closed, also hard-linked ones', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  must(await provider.handOff(FIRST));
  const outside = await mkdtemp(join(tmpdir(), 'taskelith-outside-'));
  try {
    await writeFile(join(checkout, 'closed.txt'), 'closed\n');
    await writeFile(join(checkout, 'read-only.sh'), 'run\n');
    await link(join(checkout, 'closed.txt'), join(outside, 'closed.txt'));
    await chmod(join(checkout, 'closed.txt'), 0o000);
    await chmod(join(checkout, 'read-only.sh'), 0o500);
    must(await provider.reclaim(FIRST));
    assert.equal(await modeOf(join(checkout, 'closed.txt')), 0o660);
    assert.equal(await modeOf(join(checkout, 'read-only.sh')), 0o770);
    assert.equal(await readFile(join(checkout, 'closed.txt'), 'utf8'), 'closed\n');
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
}));

test('a reclaim never writes through or over an entry the agent named like its copy', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  must(await provider.handOff(FIRST));
  const outside = await mkdtemp(join(tmpdir(), 'taskelith-outside-'));
  try {
    await writeFile(join(outside, 'target'), 'target\n');
    await writeFile(join(outside, 'linked'), 'linked\n');
    await writeFile(join(checkout, 'a.txt'), 'a\n');
    await writeFile(join(checkout, 'b.txt'), 'b\n');
    await writeFile(join(checkout, 'c.txt'), 'c\n');
    for (const name of ['a.txt', 'b.txt', 'c.txt']) await link(join(checkout, name), join(outside, `${name}.link`));
    await symlink(join(outside, 'target'), join(checkout, 'a.txt.reclaim'));
    await link(join(outside, 'linked'), join(checkout, 'b.txt.reclaim'));
    await writeFile(join(checkout, 'c.txt.reclaim'), 'project\n');
    must(await provider.reclaim(FIRST));
    assert.equal(await readFile(join(outside, 'target'), 'utf8'), 'target\n');
    assert.equal(await readFile(join(outside, 'linked'), 'utf8'), 'linked\n');
    assert.equal(await readFile(join(checkout, 'b.txt.reclaim'), 'utf8'), 'linked\n');
    assert.equal(await readFile(join(checkout, 'c.txt.reclaim'), 'utf8'), 'project\n');
    for (const name of ['a.txt', 'b.txt', 'c.txt']) assert.equal(await readFile(join(checkout, name), 'utf8'), `${name[0]}\n`);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
}));

test('a reclaim never opens a hard-linked special file', () => withFixture(async (fixture, provider) => {
  const checkout = must(await provider.prepare(request(fixture))).workingDirectory;
  must(await provider.handOff(FIRST));
  const outside = await mkdtemp(join(tmpdir(), 'taskelith-outside-'));
  try {
    await promisify(execFile)('mkfifo', [join(checkout, 'pipe')]);
    await link(join(checkout, 'pipe'), join(outside, 'pipe'));
    must(await provider.reclaim(FIRST));
    assert.equal((await lstat(join(checkout, 'pipe'))).isFIFO(), true);
    assert.equal(await modeOf(join(checkout, 'pipe')), 0o660);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
}));

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// Whether the promise settles once every pending reaction has run.
async function settlesNow(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  const settle = () => {
    settled = true;
  };
  void promise.then(settle, settle);
  await new Promise(setImmediate);
  return settled;
}

test('a racing check that throws rejects with its error and releases the one waiting', async () => {
  const barrier = new CheckBarrier();
  const failure = new Error('the listing failed');
  const failing = deferred<string>();
  const waiting = barrier.afterAllChecks(async () => 'checked');
  const thrown = barrier.afterAllChecks(() => failing.promise);
  assert.equal(await settlesNow(waiting), false);
  failing.reject(failure);
  await assert.rejects(thrown, (error) => error === failure);
  assert.equal(await waiting, 'checked');
});

test('the racing barrier holds a pair of checks again after a check threw', async () => {
  const barrier = new CheckBarrier();
  await assert.rejects(barrier.afterAllChecks(() => Promise.reject(new Error('the listing failed'))));
  const late = deferred<string>();
  const first = barrier.afterAllChecks(async () => 'first');
  const second = barrier.afterAllChecks(() => late.promise);
  assert.equal(await settlesNow(first), false);
  late.resolve('second');
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
});

test('racing hand-offs whose listing fails reject with its error and race again later', async () => {
  const { fixture, dispose } = await createFixture({ racesHandOff: true });
  try {
    const provider = fixture.provider as TempDirWorkspaces;
    for (const attemptId of [FIRST, SECOND]) must(await provider.prepare(request(fixture, { attemptId })));
    const recordless = join(provider.root, 'recordless');
    await mkdir(recordless);
    const failed = await Promise.allSettled([provider.handOff(FIRST), provider.handOff(SECOND)]);
    assert.deepEqual(failed.map((outcome) => outcome.status === 'rejected' && outcome.reason.code), ['ENOENT', 'ENOENT']);
    await rm(recordless, { recursive: true });
    const raced = await Promise.all([provider.handOff(FIRST), provider.handOff(SECOND)]);
    assert.deepEqual(raced.map((result) => result.ok), [true, true]);
  } finally {
    await dispose();
  }
});

test('planted settings are valid Git configuration with sections and subsections', () => withFixture(async (fixture, provider) => {
  must(await provider.prepare(request(fixture)));
  await fixture.plantGitSetting(FIRST, 'core.hooksPath', '/planted/hooks');
  await fixture.plantGitSetting(FIRST, 'url.https://planted.example/.insteadOf', 'https://');
  const file = join(must(await provider.checkoutOf(FIRST)), '.git', 'config');
  const { stdout } = await promisify(execFile)('git', ['config', '--file', file, '--list']);
  assert.deepEqual(stdout.trim().split('\n'), [
    'core.repositoryformatversion=0', 'core.hookspath=/planted/hooks', 'url.https://planted.example/.insteadof=https://',
  ]);
}));

test('the snapshot reader takes pax records by length, so a path may hold a newline', () => {
  const path = `${'long/'.repeat(25)}line\nbreak.txt`;
  const archive = encodeHeadSnapshot(new Map([[path, { type: 'file', mode: '100644', content: Uint8Array.of(1) }]]));
  assert.ok(archive.ok);
  assert.deepEqual(Object.keys(decodeTar(archive.value)), [path]);
});

test('the snapshot reader and the working tree keep a file named __proto__', () => withFixture(async (fixture, provider) => {
  const archive = encodeHeadSnapshot(new Map([['__proto__', { type: 'file', mode: '100644', content: Uint8Array.of(1) }]]));
  assert.ok(archive.ok);
  assert.deepEqual(Object.keys(decodeTar(archive.value)), ['__proto__']);
  must(await provider.prepare(request(fixture)));
  await fixture.writeFile(FIRST, '__proto__', 'proto\n');
  await fixture.commitAll(FIRST, 'proto');
  const snapshot = must(await provider.snapshot(FIRST));
  assert.deepEqual(Object.keys(await fixture.readSnapshot(snapshot.content)).sort(), ['.gitignore', 'README.md', '__proto__']);
}));
