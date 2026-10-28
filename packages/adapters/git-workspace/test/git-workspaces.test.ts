import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, readdir, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CrashPoints, failed, id, value } from '@taskelith/testing';
import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import { sha256IdentifierDigest, type GitWorkspaceCrashPoint } from '@taskelith/git-workspace';
import {
  HEAD_SNAPSHOT_CONTENT_TYPE,
  WORKSPACE_LAYOUT,
  encodeHeadSnapshot,
  gitProcessProblems,
  sensitiveValues,
  taskBranchName,
  workspaceDirectoryName,
  type CodeHeadIdentity,
  type PrepareWorkspace,
  type TreeEntry,
} from '@taskelith/workspace';
import { createGitFixture, type GitFixture } from './git-fixture.ts';

const FIRST = id('AttemptId', 'attempt-1') as AttemptId;
const SECOND = id('AttemptId', 'attempt-2') as AttemptId;
const THIRD = id('AttemptId', 'attempt-3') as AttemptId;
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const TASK = id('TaskId', 'task-1') as TaskId;
const encode = (text: string) => new TextEncoder().encode(text);
const NON_UTF8 = Buffer.from([0x6e, 0xff]);

function request(git: GitFixture, overrides: Partial<PrepareWorkspace> = {}): PrepareWorkspace {
  const { binding, credentials } = git.fixture;
  return { attemptId: FIRST, projectId: PROJECT, taskId: TASK, binding, target: { kind: 'task-branch' }, credential: credentials.read, ...overrides };
}

async function withFixture(run: (git: GitFixture) => Promise<void>, options = {}): Promise<void> {
  const git = await createGitFixture(options);
  try {
    await run(git);
  } finally {
    await git.dispose();
  }
}

const sameBytes = (left: Uint8Array, right: Uint8Array) => Buffer.from(left).equals(Buffer.from(right));
const sorted = (tree: Record<string, TreeEntry>) => Object.fromEntries(Object.entries(tree).sort(([left], [right]) => (left < right ? -1 : 1)));
const LONG_PATH = `${'directory/'.repeat(12)}file.txt`;

test('a snapshot holds the clean head tree in bytes equal across clones and runs', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'change.txt', 'change\n');
  await fixture.writeExecutable(FIRST, 'run.sh', 'echo run\n');
  await fixture.writeLink(FIRST, 'latest', 'change.txt');
  await fixture.writeBytes(FIRST, 'blob.bin', Uint8Array.of(0, 128, 255));
  await fixture.writeFile(FIRST, '__proto__', 'proto\n');
  await fixture.writeFile(FIRST, LONG_PATH, 'long\n');
  await fixture.commitAll(FIRST, 'tree');
  await fixture.writeFile(FIRST, fixture.ignoredPath, 'ignored\n');
  const status = value(await local.inspect(FIRST));
  const first = value(await local.snapshot(FIRST));
  assert.deepEqual([first.head, first.contentType], [status.head, HEAD_SNAPSHOT_CONTENT_TYPE]);
  const decoded = await fixture.readSnapshot(first.content);
  assert.deepEqual(sorted(decoded), sorted({
    ...fixture.baseTree,
    'change.txt': { type: 'file', mode: '100644', content: encode('change\n') },
    'run.sh': { type: 'file', mode: '100755', content: encode('echo run\n') },
    latest: { type: 'link', target: 'change.txt' },
    'blob.bin': { type: 'file', mode: '100644', content: Uint8Array.of(0, 128, 255) },
    ['__proto__']: { type: 'file', mode: '100644', content: encode('proto\n') },
    [LONG_PATH]: { type: 'file', mode: '100644', content: encode('long\n') },
  }));
  assert.ok(sameBytes(value(encodeHeadSnapshot(new Map(Object.entries(decoded)))), first.content));
  assert.ok(sameBytes(value(await local.snapshot(FIRST)).content, first.content), 'a second run');
  await git.publish(FIRST, 'published');
  value(await local.prepare(request(git, { attemptId: SECOND, target: { kind: 'at-head', head: first.head } })));
  assert.ok(sameBytes(value(await local.snapshot(SECOND)).content, first.content), 'a second clone');
  await fixture.commitAll(FIRST, 'empty');
  const recommitted = value(await local.snapshot(FIRST));
  assert.notEqual(recommitted.head.commit, first.head.commit);
  assert.ok(sameBytes(recommitted.content, first.content), 'an empty commit');
}));

test('a staged change reverted in the working tree keeps snapshot and removal refused', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, fixture.trackedPath, 'staged\n');
  await fixture.stage(FIRST, fixture.trackedPath);
  await fixture.writeFile(FIRST, fixture.trackedPath, 'base\n');
  assert.deepEqual(value(await local.inspect(FIRST)).dirtyReasons, ['modified']);
  for (const result of [await local.snapshot(FIRST), await local.remove(FIRST)] as Result<unknown>[]) {
    const failure = failed(result);
    assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'workspace-dirty']);
  }
  assert.deepEqual(await local.list(), [FIRST]);
}));

test('a path or link target that is not UTF-8 is refused by snapshot only', { skip: process.platform === 'darwin' ? 'APFS refuses names that are not UTF-8' : false }, () => withFixture(async (git) => {
  const { fixture, local } = git;
  for (const [attemptId, plant] of [
    [FIRST, (checkout: Buffer) => writeFile(Buffer.concat([checkout, NON_UTF8]), 'bytes\n')],
    [SECOND, (checkout: Buffer) => symlink(NON_UTF8, Buffer.concat([checkout, Buffer.from('link')]))],
  ] as const) {
    value(await local.prepare(request(git, { attemptId })));
    await plant(Buffer.from(`${git.checkout(attemptId)}/`));
    await fixture.commitAll(attemptId, 'bytes');
    assert.deepEqual(value(await local.inspect(attemptId)).dirtyReasons, []);
    const failure = failed(await local.snapshot(attemptId));
    assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'non-utf8-path']);
  }
}));

test('an unsafe checkout refuses inspect, snapshot, and remove, and is kept', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const before = await fixture.controlRecords();
  for (const attemptId of [FIRST, SECOND, THIRD]) value(await local.prepare(request(git, { attemptId })));
  await fixture.linkInGitDirectory(FIRST);
  await fixture.removeGitDirectory(SECOND);
  await fixture.nestGitFile(THIRD, `${git.checkout(FIRST)}/.git`);
  for (const attemptId of [FIRST, SECOND, THIRD]) {
    for (const result of [await local.inspect(attemptId), await local.snapshot(attemptId), await local.remove(attemptId)] as Result<unknown>[]) {
      const failure = failed(result);
      assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'unsafe-checkout'], attemptId);
    }
  }
  assert.deepEqual(await local.list(), [FIRST, SECOND, THIRD]);
  assert.equal(await fixture.controlRecords(), before);
}));

test('a hand-off record refuses Git work before the Git directory check', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.removeGitDirectory(FIRST);
  await writeFile(join(git.checkout(FIRST), '..', WORKSPACE_LAYOUT.handOffRecord), '');
  for (const result of [await local.inspect(FIRST), await local.snapshot(FIRST), await local.remove(FIRST)] as Result<unknown>[]) {
    const failure = failed(result);
    assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'workspace-handed-off']);
  }
  assert.equal(failed(await local.inspect(SECOND)).code, 'not-found');
  value(await local.remove(SECOND));
}));

test('settings planted in .git/config never act and are gone after the next Git call', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  const checkout = git.checkout(FIRST);
  const marker = join(git.scratch, 'planted-ran');
  const script = join(git.scratch, 'planted.sh');
  await writeFile(script, `#!/bin/sh\ntouch ${marker}\ncat\n`);
  await chmod(script, 0o755);
  await writeFile(join(checkout, '.gitattributes'), '*.txt filter=planted\n');
  await fixture.writeFile(FIRST, 'filtered.txt', 'filtered\n');
  await fixture.commitAll(FIRST, 'attributes');
  const hooks = join(git.scratch, 'planted-hooks');
  await mkdir(hooks);
  for (const hook of ['post-index-change', 'reference-transaction']) {
    await writeFile(join(hooks, hook), `#!/bin/sh\ntouch ${marker}\n`);
    await chmod(join(hooks, hook), 0o755);
  }
  await writeFile(join(git.scratch, 'planted-include'), `[core]\n\tfsmonitor = ${script}\n`);
  const planted: [string, string][] = [
    ['core.hooksPath', hooks], ['filter.planted.clean', script], ['filter.planted.required', 'true'],
    ['include.path', join(git.scratch, 'planted-include')], ['core.fsmonitor', script], ['credential.helper', script],
    ['http.proxy', 'http://planted.example:3128'], ['remote.origin.pushurl', 'https://planted.example/push.git'],
  ];
  for (const [key, setting] of planted) await fixture.plantGitSetting(FIRST, key, setting);
  const since = (await fixture.gitProcesses()).length;
  const later = new Date(Date.now() + 5_000);
  await utimes(join(checkout, 'filtered.txt'), later, later);
  assert.deepEqual(value(await local.inspect(FIRST)).dirtyReasons, []);
  value(await local.snapshot(FIRST));
  value(await local.remove(FIRST));
  await assert.rejects(lstat(marker), { code: 'ENOENT' });
  const started = (await fixture.gitProcesses()).slice(since);
  assert.ok(started.length > 0);
  const withPlanted = started.filter(({ argv, repositoryConfig }) => argv.slice(1).some((arg) => arg.includes('planted')) || (repositoryConfig ?? '').includes('planted'));
  assert.deepEqual(withPlanted, []);
}));

test('every Git process of the local operations has the built environment and the pinned path', () => withFixture(async (git) => {
  const { fixture, local, remote } = git;
  const { read } = fixture.credentials;
  value(await local.prepare(request(git)));
  const preparing = (await fixture.gitProcesses()).length;
  await fixture.writeFile(FIRST, 'change.txt', 'change\n');
  await fixture.commitAll(FIRST, 'change');
  value(await local.inspect(FIRST));
  value(await local.snapshot(FIRST));
  value(await local.remove(FIRST));
  const processes = await fixture.gitProcesses();
  const sensitive = sensitiveValues(Object.values(fixture.credentials));
  const reachesRemote = (argv: readonly string[]) => argv.includes(fixture.binding.remote);
  const problems = processes.flatMap((process, index) => {
    const credentialId = index < preparing && reachesRemote(process.argv) ? read.credentialId : null;
    return gitProcessProblems(process, { credentialId, clientPath: fixture.gitClient.path }, sensitive);
  });
  assert.deepEqual(problems, []);
  const clones = processes.filter(({ argv }) => argv.includes('clone'));
  assert.equal(clones.length, 1);
  assert.ok(reachesRemote(clones[0]!.argv));
  assert.equal(processes.filter(({ argv }) => reachesRemote(argv)).length, 1);
  assert.ok(remote.requests > 0);
  assert.deepEqual([...new Set(remote.authorizations)], [read.authorization]);
}));

test('a prepare at a head opens it detached and clean', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const base = value(await local.prepare(request(git)));
  const head: CodeHeadIdentity = base.head;
  const review = value(await local.prepare(request(git, { attemptId: SECOND, target: { kind: 'at-head', head } })));
  assert.deepEqual([review.kind, review.branch, review.head], ['at-head', null, head]);
  assert.deepEqual(value(await local.inspect(SECOND)), { head, branch: null, dirtyReasons: [] });
  assert.equal(base.branch, taskBranchName(TASK, sha256IdentifierDigest));
  assert.equal(base.workingDirectory, join(fixture.dataRoot, WORKSPACE_LAYOUT.root, workspaceDirectoryName(FIRST, sha256IdentifierDigest), WORKSPACE_LAYOUT.checkout));
}));

test('of two concurrent prepares of one attempt exactly one succeeds', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const results = await Promise.all([local.prepare(request(git)), local.prepare(request(git))]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(failed(results.find((result) => !result.ok)!).code, 'conflict');
  assert.deepEqual([await local.list(), await fixture.leftovers()], [[FIRST], []]);
}));

test('the workspace record and the checkout get their modes', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  const workspace = join(git.checkout(FIRST), '..');
  const mode = async (path: string) => (await lstat(path)).mode & 0o7777;
  assert.deepEqual([await mode(workspace), await mode(join(workspace, WORKSPACE_LAYOUT.metadata)), await mode(git.checkout(FIRST))], [0o710, 0o600, 0o2700]);
  assert.deepEqual((await readdir(workspace)).sort(), [WORKSPACE_LAYOUT.checkout, WORKSPACE_LAYOUT.metadata]);
}));

// What a restart finds after a crash at each point (contract section 3).
const PREPARE_CRASHES: readonly [GitWorkspaceCrashPoint, boolean][] = [['WS1.before', false], ['WS1.after', false], ['WS2.before', false], ['WS2.after', true]];
const REMOVE_CRASHES: readonly [GitWorkspaceCrashPoint, boolean][] = [['WS3.before', true], ['WS3.after', false], ['WS4.before', false], ['WS4.after', false]];

for (const [point, ready] of PREPARE_CRASHES) {
  test(`a crash at ${point} of a prepare leaves ${ready ? 'a complete workspace' : 'no workspace'} after sweep`, () => withFixture(async (git) => {
    const crashing = git.reopen(new CrashPoints({ point, occurrence: 1, action: 'throw' }));
    await assert.rejects(crashing.prepare(request(git)), { name: 'SimulatedCrash' });
    const restarted = git.reopen();
    await restarted.sweep();
    assert.deepEqual([await restarted.list(), await git.fixture.leftovers()], [ready ? [FIRST] : [], []]);
    if (ready) value(await restarted.inspect(FIRST));
    else value(await restarted.prepare(request(git)));
  }));
}

for (const [point, ready] of REMOVE_CRASHES) {
  test(`a crash at ${point} of a removal leaves ${ready ? 'a ready workspace' : 'a removal that sweep finishes'}`, () => withFixture(async (git) => {
    const before = await git.fixture.controlRecords();
    value(await git.local.prepare(request(git)));
    await git.fixture.linkToControlRecord(FIRST, 'link-to-record');
    await git.fixture.commitAll(FIRST, 'link');
    const crashing = git.reopen(new CrashPoints({ point, occurrence: 1, action: 'throw' }));
    await assert.rejects(crashing.remove(FIRST), { name: 'SimulatedCrash' });
    const restarted = git.reopen();
    assert.deepEqual(await restarted.list(), ready ? [FIRST] : []);
    await restarted.sweep();
    assert.deepEqual([await restarted.list(), await git.fixture.leftovers()], [ready ? [FIRST] : [], []]);
    assert.equal(await git.fixture.controlRecords(), before);
  }));
}

test('a crash while sweep deletes a removing entry leaves it for the next sweep', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  await git.fixture.interruptRemove(FIRST);
  await assert.rejects(git.reopen(new CrashPoints({ point: 'WS4.before', occurrence: 1, action: 'throw' })).sweep(), { name: 'SimulatedCrash' });
  assert.equal((await git.fixture.leftovers()).length, 1);
  await git.reopen().sweep();
  assert.deepEqual(await git.fixture.leftovers(), []);
}));

test('a prepare that fails after its clone leaves nothing behind', () => withFixture(async (git) => {
  const { fixture, local } = git;
  const unknown = { repository: fixture.binding.repository, commit: '0'.repeat(40), tree: '0'.repeat(40) } as CodeHeadIdentity;
  assert.equal(failed(await local.prepare(request(git, { target: { kind: 'at-head', head: unknown } }))).code, 'not-found');
  const unreachable = { ...fixture.binding, remote: `${fixture.binding.remote}-missing` };
  assert.equal(failed(await local.prepare(request(git, { binding: unreachable }))).code, 'unavailable');
  assert.deepEqual([await local.list(), await fixture.leftovers()], [[], []]);
}));
