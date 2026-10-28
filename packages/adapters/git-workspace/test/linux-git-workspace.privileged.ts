import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CrashPoints, failed, id, value } from '@taskelith/testing';
import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import {
  LinuxReclaimHost,
  credentialForms,
  parseHandOffRecord,
  sha256IdentifierDigest,
  verifyGitClient,
  type ReclaimProgram,
} from '@taskelith/git-workspace';
import {
  GIT_CLIENT_PINS,
  WORKSPACE_CONFORMANCE,
  WORKSPACE_LAYOUT,
  reclaimContainmentName,
  taskBranchName,
  type PrepareWorkspace,
} from '@taskelith/workspace';
import { CountingHost, createGitFixture, runProcess, type GitFixture, type GitFixtureOptions } from './git-fixture.ts';

// Contract section 13, "Linux tests": in the worker image as root with
// SETUID, SETGID, and KILL, the execution group, and umask 0007.
const EXECUTION = { uid: 10003, gid: 10003 };
const CONTAINMENT_PARENT = process.env.TASKELITH_CONTAINMENT_PARENT ?? '/sys/fs/cgroup/executions';
// Outside TMPDIR, whose ancestors may hold a repository on a host.
const SCRATCH_PARENT = '/var/lib/taskelith-git-workspace-tests';
const FIRST = id('AttemptId', 'attempt-1') as AttemptId;
const SECOND = id('AttemptId', 'attempt-2') as AttemptId;
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const TASK = id('TaskId', 'task-1') as TaskId;
const SHORT_BOUND_MS = 1_500;
const TEST_PROGRAM = fileURLToPath(new URL('./linux-reclaim-program.ts', import.meta.url));

// Open to the execution account's traversal, whatever the umask.
await mkdir(SCRATCH_PARENT, { recursive: true });
await chmod(SCRATCH_PARENT, 0o755);
const holds = await mkdtemp(join(SCRATCH_PARENT, 'holds-'));
await chmod(holds, 0o755);

const testProgram = (mode: 'hold' | 'fail', hold = '-'): ReclaimProgram => ({
  executable: process.execPath, args: ['--experimental-strip-types', TEST_PROGRAM, mode, hold],
});

function linuxHost(program?: ReclaimProgram): CountingHost {
  return new CountingHost(new LinuxReclaimHost({ containmentParent: CONTAINMENT_PARENT, executionAccount: EXECUTION, program }));
}

async function withLinuxFixture(run: (git: GitFixture) => Promise<void>, options: GitFixtureOptions = {}): Promise<void> {
  const git = await createGitFixture({ scratchParent: SCRATCH_PARENT, executionGroup: EXECUTION.gid, reclaimHost: linuxHost(), ...options });
  try {
    await run(git);
  } finally {
    // An agent's closed entry may outlive a failed case; the container goes.
    await git.dispose().catch(() => {});
  }
}

function request(git: GitFixture, attemptId = FIRST): PrepareWorkspace {
  const { binding, credentials } = git.fixture;
  return { attemptId, projectId: PROJECT, taskId: TASK, binding, target: { kind: 'task-branch' }, credential: credentials.read };
}

// A command of the agent: the execution account, no supplementary group,
// and its own umask.
function asAgent(cwd: string, command: string, env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn('/bin/sh', ['-c', `umask 022; ${command}`], {
      cwd, uid: EXECUTION.uid, gid: EXECUTION.gid, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', ...env },
    });
    const [stdout, stderr]: Buffer[][] = [[], []];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', fail);
    child.once('close', (code) => done({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
  });
}

// The harness's Git: `safe.directory` for exactly its checkout (section 7).
const harnessGit = (checkout: string) => ({
  GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '', GIT_CONFIG_KEY_1: 'safe.directory', GIT_CONFIG_VALUE_1: checkout,
  GIT_AUTHOR_NAME: 'Agent', GIT_AUTHOR_EMAIL: 'agent@example.invalid', GIT_COMMITTER_NAME: 'Agent', GIT_COMMITTER_EMAIL: 'agent@example.invalid',
});

async function agentSucceeds(cwd: string, command: string, env: Record<string, string> = {}): Promise<string> {
  const run = await asAgent(cwd, command, env);
  assert.equal(run.code, 0, `the agent's ${command}: ${run.stderr}`);
  return run.stdout;
}

async function agentRefused(cwd: string, command: string): Promise<void> {
  assert.notEqual((await asAgent(cwd, command)).code, 0, `the agent's ${command} must fail`);
}

const homeCgroup = async () => (await readFile('/proc/self/cgroup', 'utf8')).trim();

async function processesOf(cgroupName: string): Promise<{ pid: number; uid: number; cgroup: string }[]> {
  const procs = await readFile(join(CONTAINMENT_PARENT, cgroupName, 'cgroup.procs'), 'utf8').catch(() => '');
  return Promise.all(procs.split('\n').filter(Boolean).map(async (pid) => ({
    pid: Number(pid),
    uid: Number(/^Uid:\s+(\d+)/m.exec(await readFile(`/proc/${pid}/status`, 'utf8'))![1]),
    cgroup: (await readFile(`/proc/${pid}/cgroup`, 'utf8')).trim(),
  })));
}

async function untilPopulated(cgroupName: string): Promise<void> {
  for (let polls = 0; polls < 200; polls += 1) {
    if ((await processesOf(cgroupName)).length > 0) return;
    await delay(50);
  }
  throw new Error(`${cgroupName} never held a process`);
}

async function holdFile(): Promise<string> {
  const hold = join(holds, `hold-${Math.random().toString(16).slice(2)}`);
  await writeFile(hold, '');
  return hold;
}

const reasonOf = (result: Result<unknown>) => failed(result).details.reason;
const recordOf = async (git: GitFixture, attemptId = FIRST) => parseHandOffRecord(await readFile(join(git.checkout(attemptId), '..', WORKSPACE_LAYOUT.handOffRecord), 'utf8'));

test('the worker image holds the pinned Git client and package', async () => {
  value(await verifyGitClient(GIT_CLIENT_PINS.linux));
  const run = await runProcess('/usr/bin/dpkg-query', ['--show', '--showformat=${Version}', 'git'], { env: { PATH: '/usr/bin:/bin' } });
  assert.equal(run.stdout.toString('utf8'), '1:2.43.0-1ubuntu7.4');
});

for (const conformance of WORKSPACE_CONFORMANCE) {
  test(`in the worker image with the execution account: ${conformance.name}`, () => withLinuxFixture(async (git) => {
    assert.equal(git.fixture.separateExecutionIdentity, true);
    assert.deepEqual(await conformance.check(git.fixture), []);
  }));
}

test('the agent works in its handed-off checkout as the execution account and reaches nothing else', () => withLinuxFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'nested/dir/file.txt', 'base\n');
  await fixture.commitAll(FIRST, 'nested');
  await git.publish(FIRST, 'main');
  value(await local.remove(FIRST));
  value(await local.prepare(request(git, SECOND)));
  const checkout = git.checkout(SECOND);
  const attempt = join(checkout, '..');
  value(await local.handOff(SECOND));
  assert.equal(await agentSucceeds(checkout, 'cat nested/dir/file.txt'), 'base\n');
  await agentSucceeds(checkout, 'printf "edited\\n" > nested/dir/file.txt && mkdir -m 0700 private && echo private > private/note');
  await agentSucceeds(checkout, 'git add -A && git commit --quiet --no-verify -m agent', harnessGit(checkout));
  const outside = `/tmp/agent-link-${Math.random().toString(16).slice(2)}`;
  await agentSucceeds(checkout, `ln nested/dir/file.txt ${outside}`);
  await agentSucceeds(checkout, 'ls');
  for (const directory of [fixture.dataRoot, join(fixture.dataRoot, 'worker'), join(fixture.dataRoot, WORKSPACE_LAYOUT.root), attempt, join(fixture.dataRoot, 'worker/journal')]) {
    await agentRefused('/', `ls '${directory}'`);
  }
  for (const record of ['worker/identity', 'worker/credentials/control-plane.1']) await agentRefused('/', `cat '${join(fixture.dataRoot, record)}'`);
  for (const record of [WORKSPACE_LAYOUT.metadata, WORKSPACE_LAYOUT.handOffRecord]) await agentRefused('/', `cat '${join(attempt, record)}'`);
  value(await local.reclaim(SECOND));
  await agentRefused('/', `ls '${checkout}'`);
  await agentSucceeds('/', `printf "outside\\n" > ${outside}`);
  assert.equal(await readFile(join(checkout, 'nested/dir/file.txt'), 'utf8'), 'edited\n');
  const status = value(await local.inspect(SECOND));
  assert.deepEqual(status.dirtyReasons, []);
  assert.deepEqual(value(await local.snapshot(SECOND)).head, status.head);
  assert.deepEqual(value(await local.push({ attemptId: SECOND, credential: fixture.credentials.write, expectedRemoteHead: null })), status.head);
  value(await local.remove(SECOND));
  assert.deepEqual(await local.list(), []);
  await rm(outside, { force: true });
}));

test('a surviving reclaim program in its recorded containment holds the workspace until it is gone', async () => {
  const hold = await holdFile();
  const host = linuxHost(testProgram('hold', hold));
  await withLinuxFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.prepare(request(git, SECOND)));
    value(await git.local.handOff(FIRST));
    await assert.rejects(git.reopen(new CrashPoints({ point: 'WS8', occurrence: 1, action: 'throw' })).reclaim(FIRST), { name: 'SimulatedCrash' });
    const name = reclaimContainmentName(FIRST, sha256IdentifierDigest);
    assert.deepEqual((await recordOf(git))?.containment, { kind: 'cgroup', name });
    await untilPopulated(name);
    const running = await processesOf(name);
    assert.ok(running.every(({ uid, cgroup }) => uid === EXECUTION.uid && cgroup === `0::/${CONTAINMENT_PARENT.split('/').at(-1)}/${name}`), JSON.stringify(running));
    const restarted = git.reopen();
    const started = Date.now();
    assert.equal(failed(await restarted.reclaim(FIRST)).code, 'unavailable');
    assert.ok(Date.now() - started >= SHORT_BOUND_MS);
    assert.equal(failed(await restarted.handOff(FIRST)).code, 'unavailable');
    assert.equal(reasonOf(await restarted.inspect(FIRST)), 'workspace-handed-off');
    assert.equal(reasonOf(await restarted.handOff(SECOND)), 'other-workspace-handed-off');
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.deepEqual((await processesOf(name)).map(({ pid }) => pid), running.map(({ pid }) => pid), 'never killed');
    assert.equal(host.launched.length, 1);
    await rm(hold);
    value(await restarted.reclaim(FIRST));
    assert.equal(host.launched.length, 2);
    assert.deepEqual(await readdir(CONTAINMENT_PARENT).then((names) => names.filter((entry) => entry === name)), []);
    value(await restarted.handOff(SECOND));
  }, { reclaimHost: host, reclaimProofBoundMs: SHORT_BOUND_MS });
});

test('a failed or killed reclaim program keeps the workspace handed off and never runs again', async () => {
  const failing = linuxHost(testProgram('fail'));
  await withLinuxFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    for (const provider of [git.local, git.reopen()]) assert.equal(reasonOf(await provider.reclaim(FIRST)), 'reclaim-failed');
    assert.equal(failing.launched.length, 1);
    assert.equal((await recordOf(git))?.reclaimFailed, true);
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
  }, { reclaimHost: failing });
  const hold = await holdFile();
  await withLinuxFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    const reclaiming = git.local.reclaim(FIRST);
    const name = reclaimContainmentName(FIRST, sha256IdentifierDigest);
    await untilPopulated(name);
    await writeFile(join(CONTAINMENT_PARENT, name, 'cgroup.kill'), '1');
    assert.equal(reasonOf(await reclaiming), 'reclaim-failed');
    assert.equal(reasonOf(await git.local.reclaim(FIRST)), 'reclaim-failed');
    await rm(hold);
  }, { reclaimHost: linuxHost(testProgram('hold', hold)) });
});

test('a reclaim program that runs after the exit keeps the one slot of the worker held', async () => {
  const hold = await holdFile();
  await withLinuxFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.prepare(request(git, SECOND)));
    value(await git.local.handOff(FIRST));
    const reclaiming = git.local.reclaim(FIRST);
    await untilPopulated(reclaimContainmentName(FIRST, sha256IdentifierDigest));
    assert.equal(reasonOf(await git.local.handOff(SECOND)), 'other-workspace-handed-off');
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    await rm(hold);
    value(await reclaiming);
    value(await git.local.handOff(SECOND));
    assert.deepEqual(await git.local.handedOff(), [SECOND]);
  }, { reclaimHost: linuxHost(testProgram('hold', hold)) });
});

test('every Git process runs as the worker identity in its home cgroup', () => withLinuxFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'change.txt', 'change\n');
  await fixture.commitAll(FIRST, 'change');
  value(await local.inspect(FIRST));
  value(await local.snapshot(FIRST));
  value(await local.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.read }));
  value(await local.push({ attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null }));
  value(await local.handOff(FIRST));
  value(await local.reclaim(FIRST));
  value(await local.remove(FIRST));
  const placements = await git.gitPlacements();
  const subcommands = new Set(placements.map(({ argv }) => argv[1]));
  for (const subcommand of ['clone', 'status', 'cat-file', 'ls-remote', 'push']) assert.ok(subcommands.has(subcommand), subcommand);
  const home = await homeCgroup();
  for (const { argv, uid, cgroup } of placements) {
    assert.deepEqual([uid, cgroup?.trim()], [0, home], argv.join(' '));
    assert.ok(!cgroup!.includes(`/${CONTAINMENT_PARENT.split('/').at(-1)}/`), argv.join(' '));
  }
}));

// Every byte under `directory`, as text, for a scan of credential forms.
async function allBytes(directory: string): Promise<string> {
  const parts: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(path, await allBytes(path));
    else if (entry.isFile()) parts.push(path, await readFile(path, 'latin1'));
  }
  return parts.join('\n');
}

test('no secret reaches a log, a result, or a file of the data root', () => withLinuxFixture(async (git) => {
  const { fixture, local } = git;
  const results: Result<unknown>[] = [];
  results.push(await local.prepare(request(git)));
  await fixture.writeFile(FIRST, 'change.txt', 'change\n');
  await fixture.commitAll(FIRST, 'change');
  results.push(await local.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.write }));
  results.push(await local.push({ attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null }));
  git.remote.behavior = { kind: 'echo-authorization' };
  results.push(await local.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.write }));
  results.push(await local.prepare(request(git, SECOND)));
  assert.equal(results.at(-1)!.ok, false, 'the echoing remote fails the prepare');
  const forms = [fixture.credentials.read, fixture.credentials.write].flatMap(credentialForms);
  const seen = `${JSON.stringify(results)}\n${await allBytes(fixture.dataRoot)}`;
  assert.deepEqual(forms.filter((form) => seen.includes(form)), []);
}));

async function treeHash(directory: string): Promise<string> {
  return createHash('sha256').update(await allBytes(directory)).digest('hex');
}

test('a gitlink with a gitfile naming another workspace is refused and that workspace stays unchanged', () => withLinuxFixture(async (git) => {
  const { fixture, local } = git;
  value(await local.prepare(request(git)));
  value(await local.prepare(request(git, SECOND)));
  await fixture.commitGitlink(SECOND, 'module');
  await writeFile(join(git.checkout(SECOND), 'module', '.git'), `gitdir: ${git.checkout(FIRST)}/.git\n`);
  const before = await treeHash(join(git.checkout(FIRST), '.git'));
  const refusals = [
    await local.inspect(SECOND), await local.snapshot(SECOND),
    await local.push({ attemptId: SECOND, credential: fixture.credentials.write, expectedRemoteHead: null }), await local.remove(SECOND),
  ];
  assert.deepEqual(refusals.map(reasonOf), ['unsafe-checkout', 'unsafe-checkout', 'unsafe-checkout', 'unsafe-checkout']);
  assert.equal(await treeHash(join(git.checkout(FIRST), '.git')), before);
}));

// Restores the variables and files a test planted for inherited settings.
async function withInheritedSettings(planted: Record<string, string>, files: Record<string, string>, run: () => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(Object.keys(planted).map((key) => [key, process.env[key]]));
  Object.assign(process.env, planted);
  for (const [path, text] of Object.entries(files)) await writeFile(path, text);
  try {
    await run();
  } finally {
    for (const [key, previous] of Object.entries(saved)) {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    for (const path of Object.keys(files)) await rm(path, { force: true });
  }
}

test('inherited Git settings neither trust a replaced Git directory nor redirect or hook a push', () => withLinuxFixture(async (git) => {
  const { fixture, local } = git;
  const other = await git.startOtherRemote();
  const hooks = join(git.scratch, 'hooks');
  const marker = join(git.scratch, 'hook-ran');
  await mkdir(hooks);
  for (const hook of ['pre-push', 'post-checkout', 'reference-transaction']) {
    await writeFile(join(hooks, hook), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  }
  const global = join(git.scratch, 'global.gitconfig');
  const settings = `[safe]\n\tdirectory = *\n[core]\n\thooksPath = ${hooks}\n[url "${other.origin}/"]\n\tinsteadOf = ${git.remote.origin}/\n`;
  const planted = {
    GIT_CONFIG_GLOBAL: global, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks, SUDO_UID: String(EXECUTION.uid),
  };
  await withInheritedSettings(planted, { [global]: settings, '/etc/gitconfig': settings }, async () => {
    value(await local.prepare(request(git)));
    value(await local.prepare(request(git, SECOND)));
    value(await local.handOff(SECOND));
    const replaced = git.checkout(SECOND);
    await agentSucceeds(replaced, 'mv .git .git-old && git init --quiet', harnessGit(replaced));
    const foreign = await mkdtemp(join(SCRATCH_PARENT, 'foreign-'));
    await chmod(foreign, 0o755);
    await runProcess('/usr/bin/git', ['init', '--quiet', foreign], { env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent' } });
    assert.notEqual((await asAgent(foreign, 'git status', harnessGit(replaced))).code, 0, 'the harness trusts only its checkout');
    await rm(foreign, { recursive: true, force: true });
    value(await local.reclaim(SECOND));
    assert.equal(reasonOf(await local.inspect(SECOND)), 'unsafe-checkout');
    await fixture.writeFile(FIRST, 'change.txt', 'change\n');
    await fixture.commitAll(FIRST, 'change');
    const pushed = value(await local.push({ attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null }));
    assert.equal(await fixture.remoteHead(taskBranchName(TASK, sha256IdentifierDigest)), pushed.commit);
    assert.equal(other.requests, 0, 'nothing reached the rewritten origin');
    assert.equal(await readFile(marker).then(() => true, () => false), false, 'no hook ran');
  });
}));

test.after(() => rm(holds, { recursive: true, force: true }));
