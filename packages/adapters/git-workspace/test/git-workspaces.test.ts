import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CrashPoints, failed, id, value } from '@taskelith/testing';
import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import { GitWorkspaces, sha256IdentifierDigest, verifyGitClient, type CrashPointHook, type GitWorkspaceCrashPoint } from '@taskelith/git-workspace';
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
import { createGitFixture, nativeGit, systemGitVersion, SYSTEM_GIT, type GitFixture } from './git-fixture.ts';

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
    [THIRD, async (checkout: Buffer) => {
      await mkdir(Buffer.concat([checkout, NON_UTF8]));
      await writeFile(Buffer.concat([checkout, NON_UTF8, Buffer.from('/file')]), 'bytes\n');
    }],
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

const native = async (git: GitFixture, args: readonly string[], input?: string) => (await nativeGit(git.checkout(FIRST), args, input === undefined ? {} : { input: encode(input) })).toString('utf8').trim();

// A replacement of the head commit or of one of its blobs.
const REPLACEMENTS: readonly [string, (git: GitFixture) => Promise<[string, string]>][] = [
  ['blob', async (git) => [await native(git, ['rev-parse', 'HEAD:real.txt']), await native(git, ['hash-object', '-w', '--stdin'], 'replaced\n')]],
  ['commit', async (git) => [await native(git, ['rev-parse', 'HEAD']), await native(git, ['commit-tree', 'HEAD~1^{tree}', '-m', 'replaced'])]],
];

for (const [kind, replacement] of REPLACEMENTS) {
  test(`a replace ref for a ${kind} never changes what status and snapshot read`, () => withFixture(async (git) => {
    const { fixture, local } = git;
    value(await local.prepare(request(git)));
    await fixture.writeFile(FIRST, 'real.txt', 'real\n');
    await fixture.commitAll(FIRST, 'real');
    const head = await fixture.nativeHead(FIRST);
    const before = value(await local.snapshot(FIRST)).content;
    await native(git, ['replace', ...(await replacement(git))]);
    const status = value(await local.inspect(FIRST));
    assert.deepEqual([status.head.commit, status.head.tree, status.dirtyReasons], [head.commit, head.tree, []]);
    assert.ok(sameBytes(value(await local.snapshot(FIRST)).content, before));
  }));
}

for (const bit of ['--assume-unchanged', '--skip-worktree']) {
  test(`an index bit set with ${bit} never hides a modified tracked file`, () => withFixture(async (git) => {
    const { fixture, local } = git;
    value(await local.prepare(request(git)));
    await native(git, ['update-index', bit, '--', fixture.trackedPath]);
    await fixture.writeFile(FIRST, fixture.trackedPath, 'hidden change\n');
    assert.deepEqual(value(await local.inspect(FIRST)).dirtyReasons, ['modified']);
    for (const result of [await local.snapshot(FIRST), await local.remove(FIRST)] as Result<unknown>[]) {
      assert.equal(failed(result).details.reason, 'workspace-dirty');
    }
    assert.deepEqual(await local.list(), [FIRST]);
  }));
}

test('ignore and attribute rules in .git/info never hide untracked work', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  const info = join(git.checkout(FIRST), '.git', 'info');
  await mkdir(info, { recursive: true });
  await writeFile(join(info, 'exclude'), '*.work\n');
  await writeFile(join(info, 'attributes'), '*.txt -text\n');
  await fixture.writeFile(FIRST, 'unpublished.work', 'work\n');
  assert.deepEqual(value(await local.inspect(FIRST)).dirtyReasons, ['untracked']);
  assert.equal(failed(await local.remove(FIRST)).details.reason, 'workspace-dirty');
  await assert.rejects(lstat(info), { code: 'ENOENT' });
}));

// Renames a cached untracked name to a tracked one of the same length,
// with the index checksum renewed, as an agent could.
async function forgeUntrackedCache(index: string, untracked: string, tracked: string): Promise<void> {
  const bytes = await readFile(index);
  const at = bytes.lastIndexOf(Buffer.from(`${untracked}\0`));
  assert.ok(at > 0, 'the untracked cache lists the file');
  Buffer.from(tracked).copy(bytes, at);
  createHash('sha1').update(bytes.subarray(0, -20)).digest().copy(bytes, bytes.length - 20);
  await writeFile(index, bytes);
}

test('a forged untracked cache in the index never hides untracked work', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  const checkout = git.checkout(FIRST);
  const untracked = 'hidden.md';
  await writeFile(join(checkout, untracked), 'unpublished\n');
  const past = new Date(Date.now() - 60_000);
  await utimes(checkout, past, past);
  await native(git, ['update-index', '--untracked-cache']);
  await native(git, ['-c', 'status.showUntrackedFiles=all', 'status', '--porcelain', '--untracked-files=all']);
  await forgeUntrackedCache(join(checkout, '.git', 'index'), untracked, fixture.trackedPath);
  assert.equal(await native(git, ['status', '--porcelain', '--untracked-files=all']), '', 'the forged cache hides the file from Git');
  assert.deepEqual(value(await local.inspect(FIRST)).dirtyReasons, ['untracked']);
  assert.equal(failed(await local.remove(FIRST)).details.reason, 'workspace-dirty');
}));

// A file system fault such as a disk error, without its own crash point.
const faultAt = (at: GitWorkspaceCrashPoint): CrashPointHook => ({
  reach: (point) => {
    if (point === at) throw Object.assign(new Error('injected fault'), { code: 'EIO', syscall: 'write' });
  },
});

test('a file system fault fails an operation as unavailable instead of rejecting', () => withFixture(async (git) => {
  const { fixture } = git;
  const faulty = git.reopen(faultAt('WS1.after'));
  assert.equal(failed(await faulty.prepare(request(git))).code, 'unavailable');
  assert.deepEqual([await faulty.list(), await fixture.leftovers()], [[], []]);
  value(await git.local.prepare(request(git)));
  const name = workspaceDirectoryName(FIRST, sha256IdentifierDigest);
  const blocking = join(fixture.dataRoot, WORKSPACE_LAYOUT.root, `${WORKSPACE_LAYOUT.removingPrefix}${name}`, 'entry');
  await mkdir(blocking, { recursive: true });
  assert.equal(failed(await git.local.remove(FIRST)).code, 'unavailable');
  assert.deepEqual(await git.local.list(), [FIRST]);
  await rm(join(blocking, '..'), { recursive: true });
  const record = join(git.checkout(FIRST), '..', WORKSPACE_LAYOUT.metadata);
  await rm(record);
  await mkdir(record);
  for (const result of [await git.local.inspect(FIRST), await git.local.snapshot(FIRST), await git.local.remove(FIRST)] as Result<unknown>[]) {
    assert.equal(failed(result).code, 'unavailable');
  }
  await rm(record, { recursive: true });
  await writeFile(record, '{"attemptId":');
  assert.equal(failed(await git.local.inspect(FIRST)).code, 'internal');
}));

test('a failing revision lookup fails a prepare instead of reading as a missing branch', () => withFixture(async (git) => {
  const { fixture } = git;
  const path = join(git.scratch, 'bin', 'git-failing-lookup');
  await writeFile(path, `#!/bin/sh\n[ "$1" = rev-parse ] && [ "$2" = --verify ] && exit 128\nexec ${SYSTEM_GIT} "$@"\n`);
  await chmod(path, 0o755);
  const client = value(await verifyGitClient({ path, version: await systemGitVersion() }));
  const failing = new GitWorkspaces({ dataRoot: fixture.dataRoot, client, remoteTransport: 'https-or-loopback-http' });
  assert.equal(failed(await failing.prepare(request(git))).code, 'internal');
  assert.deepEqual([await failing.list(), await fixture.leftovers()], [[], []]);
}));

// A Git file's trailing SHA-1 renewed after an agent edited its bytes.
function withTrailingChecksum(bytes: Buffer): Buffer {
  const body = bytes.subarray(0, -20);
  return Buffer.concat([body, createHash('sha1').update(body).digest()]);
}

const indexPath = (git: GitFixture) => join(git.checkout(FIRST), '.git', 'index');

async function expectHiddenWorkFound(git: GitFixture, nativeStatus: readonly string[]): Promise<void> {
  assert.equal(await native(git, ['status', '--porcelain', '--untracked-files=all', ...nativeStatus]), '', 'the forgery hides the work from Git');
  assert.deepEqual(value(await git.local.inspect(FIRST)).dirtyReasons, ['modified']);
  for (const result of [await git.local.snapshot(FIRST), await git.local.remove(FIRST)] as Result<unknown>[]) {
    assert.equal(failed(result).details.reason, 'workspace-dirty');
  }
}

test('a gitlink added only to the index never hides a directory of work', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  await git.fixture.writeFile(FIRST, 'work/notes.txt', 'unpublished\n');
  await native(git, ['update-index', '--add', '--cacheinfo', `160000,${await native(git, ['rev-parse', 'HEAD'])},work`]);
  await expectHiddenWorkFound(git, ['--ignore-submodules=all']);
}));

// The stat fields of a version 2 index entry, which precede its object
// name, flags, and path (62 bytes for SHA-1).
const STAT_FIELDS = ['ctime', 'ctimeNanoseconds', 'mtime', 'mtimeNanoseconds', 'dev', 'ino', 'mode', 'uid', 'gid', 'size'] as const;

test('forged stat data in the index never hides a modified tracked file', () => withFixture(async (git) => {
  const { fixture } = git;
  value(await git.local.prepare(request(git)));
  const path = join(git.checkout(FIRST), fixture.trackedPath);
  await writeFile(path, 'BASE\n');
  const past = new Date(Date.now() - 60_000);
  await utimes(path, past, past);
  const stat = await lstat(path, { bigint: true });
  const values = [stat.ctimeNs / 1_000_000_000n, stat.ctimeNs % 1_000_000_000n, stat.mtimeNs / 1_000_000_000n, stat.mtimeNs % 1_000_000_000n, stat.dev, stat.ino, stat.mode, stat.uid, stat.gid, stat.size];
  const index = await readFile(indexPath(git));
  const entry = index.indexOf(`${fixture.trackedPath}\0`) - 62;
  STAT_FIELDS.forEach((_, at) => index.writeUInt32BE(Number(values[at]! & 0xffffffffn), entry + 4 * at));
  await writeFile(indexPath(git), withTrailingChecksum(index));
  await expectHiddenWorkFound(git, []);
}));

// Splices one index's TREE extension, its cache tree, into another.
function withCacheTree(index: Buffer, from: Buffer): Buffer {
  const extension = (bytes: Buffer) => {
    const at = bytes.indexOf('TREE');
    return [at, at + 8 + bytes.readUInt32BE(at + 4)] as const;
  };
  const [start, end] = extension(index);
  const [fromStart, fromEnd] = extension(from);
  return withTrailingChecksum(Buffer.concat([index.subarray(0, start), from.subarray(fromStart, fromEnd), index.subarray(end)]));
}

test('a forged cache tree never hides a staged change', () => withFixture(async (git) => {
  const { fixture } = git;
  value(await git.local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'src/file.txt', 'one\n');
  await fixture.commitAll(FIRST, 'src');
  const committed = await readFile(indexPath(git));
  await fixture.writeFile(FIRST, 'src/file.txt', 'staged\n');
  await fixture.stage(FIRST, 'src/file.txt');
  await writeFile(indexPath(git), withCacheTree(await readFile(indexPath(git)), committed));
  await expectHiddenWorkFound(git, []);
}));

// A pack whose index names `object` for the bytes of `forged`, with the
// loose object gone, so that Git reads the forged bytes for that name.
async function forgeObject(git: GitFixture, object: string, forged: string): Promise<void> {
  const pack = join(git.checkout(FIRST), '.git', 'objects', 'pack');
  await native(git, ['pack-objects', '-q', join(pack, 'pack')], `${await native(git, ['hash-object', '-w', '--stdin'], forged)}\n`);
  const idx = join(pack, (await readdir(pack)).find((name) => name.endsWith('.idx'))!);
  await chmod(idx, 0o644);
  const bytes = await readFile(idx);
  const name = Buffer.from(object, 'hex');
  name.copy(bytes, 8 + 256 * 4);
  for (let first = 0; first < 256; first += 1) bytes.writeUInt32BE(first >= name[0]! ? 1 : 0, 8 + 4 * first);
  await writeFile(idx, withTrailingChecksum(bytes));
  await rm(join(git.checkout(FIRST), '.git', 'objects', object.slice(0, 2), object.slice(2)));
}

test('an object whose bytes do not hash to its name fails the snapshot', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'real.txt', 'real\n');
  await fixture.commitAll(FIRST, 'real');
  const blob = await native(git, ['rev-parse', 'HEAD:real.txt']);
  await forgeObject(git, blob, 'forged\n');
  assert.equal(await native(git, ['cat-file', '-p', blob]), 'forged', 'Git reads the forged bytes');
  assert.deepEqual(value(await local.inspect(FIRST)).dirtyReasons, []);
  assert.equal(failed(await local.snapshot(FIRST)).code, 'internal');
}));

test('a forged commit-graph never changes what status reads', () => withFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'real.txt', 'real\n');
  await fixture.commitAll(FIRST, 'real');
  const head = await fixture.nativeHead(FIRST);
  const before = value(await local.snapshot(FIRST)).content;
  await native(git, ['commit-graph', 'write', '--reachable']);
  const graph = join(git.checkout(FIRST), '.git', 'objects', 'info', 'commit-graph');
  await chmod(graph, 0o644);
  const bytes = await readFile(graph);
  Buffer.from(await native(git, ['rev-parse', 'HEAD~1^{tree}']), 'hex').copy(bytes, bytes.indexOf(Buffer.from(head.tree, 'hex')));
  await writeFile(graph, withTrailingChecksum(bytes));
  assert.notEqual(await native(git, ['status', '--porcelain']), '', 'Git reads the forged root tree');
  const status = value(await local.inspect(FIRST));
  assert.deepEqual([status.head.commit, status.head.tree, status.dirtyReasons], [head.commit, head.tree, []]);
  assert.ok(sameBytes(value(await local.snapshot(FIRST)).content, before));
}));

test('a file system fault at the rename into place leaves no staging entry', () => withFixture(async (git) => {
  const faulty = git.reopen(faultAt('WS2.before'));
  assert.equal(failed(await faulty.prepare(request(git))).code, 'unavailable');
  assert.deepEqual([await faulty.list(), await git.fixture.leftovers()], [[], []]);
}));

test('a fault after the rename into place fails the prepare and keeps the ready workspace', () => withFixture(async (git) => {
  assert.equal(failed(await git.reopen(faultAt('WS2.after')).prepare(request(git))).code, 'unavailable');
  assert.deepEqual([await git.local.list(), await git.fixture.leftovers()], [[FIRST], []]);
  value(await git.local.inspect(FIRST));
}));
