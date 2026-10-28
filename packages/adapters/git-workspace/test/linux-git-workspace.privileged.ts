import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { failed, id, value } from '@taskelith/testing';
import type { Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import {
  GitRunner,
  LinuxReclaimHost,
  RECLAIM_EXIT,
  RECLAIM_PROGRAM_MAIN,
  credentialForms,
  parseHandOffRecord,
  sha256IdentifierDigest,
  verifyGitClient,
  type ReclaimProgram,
} from '@taskelith/git-workspace';
import {
  GIT_CLIENT_PINS,
  REDACTED_VALUE,
  WORKSPACE_CONFORMANCE,
  WORKSPACE_LAYOUT,
  reclaimContainmentName,
  taskBranchName,
  type PrepareWorkspace,
} from '@taskelith/workspace';
import { CountingHost, createGitFixture, killedWorker, launchedByDeadWorker, runProcess, type GitFixture, type GitFixtureOptions } from './git-fixture.ts';

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

const testProgram = (mode: 'hold' | 'fail' | 'eager', hold = '-'): ReclaimProgram => ({
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

interface ContainedProcess {
  readonly pid: number;
  readonly identity: ProcessIdentity;
  readonly cgroup: string;
}

// Real, effective, saved, and file system ids, and supplementary groups.
interface ProcessIdentity {
  readonly uids: readonly number[];
  readonly gids: readonly number[];
  readonly groups: readonly number[];
}

const EXECUTION_IDENTITY: ProcessIdentity = { uids: Array(4).fill(EXECUTION.uid), gids: Array(4).fill(EXECUTION.gid), groups: [] };

function identityOf(status: string): ProcessIdentity {
  const ids = (name: string) => {
    const line = new RegExp(`^${name}:(.*)$`, 'm').exec(status);
    if (line === null) throw new Error(`/proc status has no ${name} line`);
    return line[1]!.split(/\s+/).filter(Boolean).map(Number);
  };
  return { uids: ids('Uid'), gids: ids('Gid'), groups: ids('Groups') };
}

// The processes of a cgroup; one that exits while it is read is left out.
async function processesOf(cgroupName: string): Promise<ContainedProcess[]> {
  const procs = await readFile(join(CONTAINMENT_PARENT, cgroupName, 'cgroup.procs'), 'utf8').catch(() => '');
  const read = await Promise.all(procs.split('\n').filter(Boolean).map((pid) => processOf(Number(pid))));
  return read.filter((process) => process !== undefined);
}

async function processOf(pid: number): Promise<ContainedProcess | undefined> {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    return { pid, identity: identityOf(status), cgroup: (await readFile(`/proc/${pid}/cgroup`, 'utf8')).trim() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH') return undefined;
    throw error;
  }
}

const inContainment = (name: string) => `0::/${CONTAINMENT_PARENT.split('/').at(-1)}/${name}`;

async function untilPopulated(cgroupName: string): Promise<void> {
  for (let polls = 0; polls < 200; polls += 1) {
    if ((await processesOf(cgroupName)).length > 0) return;
    await delay(50);
  }
  throw new Error(`${cgroupName} never held a process`);
}

// Once the record names the containment, the program has signalled ready.
async function untilRecorded(git: GitFixture): Promise<void> {
  for (let polls = 0; polls < 200; polls += 1) {
    if ((await recordOf(git))?.containment) return;
    await delay(50);
  }
  throw new Error('the hand-off record never named the containment');
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

// CAP_KILL (5), CAP_SETGID (6), and CAP_SETUID (7), and no other.
const WORKER_CAPABILITIES = (2n ** 5n | 2n ** 6n | 2n ** 7n).toString(16).padStart(16, '0');

test('the tests run as root with only the setuid, setgid, and kill capabilities', async () => {
  const status = await readFile('/proc/self/status', 'utf8');
  for (const set of ['CapBnd', 'CapEff']) assert.equal(new RegExp(`^${set}:\\s+(\\w+)$`, 'm').exec(status)?.[1], WORKER_CAPABILITIES, set);
  assert.equal(process.getuid!(), 0);
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
    const crashed = { kind: 'linux', containmentParent: CONTAINMENT_PARENT, executionAccount: EXECUTION, program: testProgram('hold', hold) } as const;
    await killedWorker(git, { operation: 'reclaim', attemptId: FIRST, point: 'WS8', host: crashed });
    const name = reclaimContainmentName(FIRST, sha256IdentifierDigest);
    assert.deepEqual((await recordOf(git))?.containment, { kind: 'cgroup', name });
    const running = await processesOf(name);
    assert.ok(running.length > 0 && running.every(({ identity, cgroup }) => isDeepStrictEqual(identity, EXECUTION_IDENTITY) && cgroup === inContainment(name)), JSON.stringify(running));
    const restarted = git.reopen();
    const started = Date.now();
    assert.equal(failed(await restarted.reclaim(FIRST)).code, 'unavailable');
    assert.ok(Date.now() - started >= SHORT_BOUND_MS);
    assert.equal(failed(await restarted.handOff(FIRST)).code, 'unavailable');
    assert.equal(reasonOf(await restarted.inspect(FIRST)), 'workspace-handed-off');
    assert.equal(reasonOf(await restarted.handOff(SECOND)), 'other-workspace-handed-off');
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.deepEqual((await processesOf(name)).map(({ pid }) => pid), running.map(({ pid }) => pid), 'never killed');
    assert.equal(host.launched.length, 0);
    await rm(hold);
    value(await restarted.reclaim(FIRST));
    assert.equal(host.launched.length, 1);
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
    await untilRecorded(git);
    await writeFile(join(CONTAINMENT_PARENT, name, 'cgroup.kill'), '1');
    assert.equal(reasonOf(await reclaiming), 'reclaim-failed');
    assert.equal(reasonOf(await git.local.reclaim(FIRST)), 'reclaim-failed');
    await rm(hold);
  }, { reclaimHost: linuxHost(testProgram('hold', hold)) });
});

const populatedNow = async (cgroupName: string) => (await readFile(join(CONTAINMENT_PARENT, cgroupName, 'cgroup.events'), 'utf8')).includes('populated 1');

// A checkout that the execution account made, without CAP_CHOWN, with a
// file that normalization changes; `remove` deletes it as that account.
async function accountCheckout(): Promise<{ checkout: string; file: string; remove: () => Promise<string> }> {
  const shared = await mkdtemp(join(holds, 'account-'));
  await chmod(shared, 0o1777);
  await agentSucceeds(shared, 'mkdir -m 0755 checkout && printf text > checkout/file && chmod 0600 checkout/file');
  return { checkout: join(shared, 'checkout'), file: join(shared, 'checkout', 'file'), remove: () => agentSucceeds(shared, 'rm -rf checkout') };
}

const modeOf = async (path: string) => (await stat(path)).mode & 0o7777;

async function fifoIn(directory: string, name: string): Promise<string> {
  const path = join(directory, name);
  assert.equal((await runProcess('/usr/bin/mkfifo', [path], { env: { PATH: '/usr/bin:/bin' } })).code, 0);
  return path;
}

// A FIFO read waits for a program; a regressed one must fail, not hang.
const FIFO_TEST_BOUND_MS = 60_000;

// Runs a program behind a root shell that writes its exit code into the
// FIFO `status`, so a test reads the code even of an orphaned program.
function reporting(status: string, args: readonly string[]): ReclaimProgram {
  return { executable: '/bin/sh', args: ['-c', 'status="$1"; shift; "$@"; echo $? > "$status"', 'reclaim', status, process.execPath, ...args] };
}

test('a reclaim program without go in its window or with a dead worker exits abandoned and unchanged', { timeout: FIFO_TEST_BOUND_MS }, async () => {
  const control = await accountCheckout();
  const eager = value(await linuxHost(testProgram('eager')).launch(control.checkout, 'reclaim-eager'));
  assert.equal(await eager.go(), 'succeeded');
  assert.equal(await modeOf(control.file), 0o660, 'a program that ignores go changes the file');
  const waiting = await accountCheckout();
  const { checkout, file } = waiting;
  const lateStatus = await fifoIn(holds, 'status-late');
  const windowed = linuxHost(reporting(lateStatus, [RECLAIM_PROGRAM_MAIN, '--go-within-ms', '3000']));
  const late = value(await windowed.launch(checkout, 'reclaim-late-go'));
  assert.deepEqual((await processesOf('reclaim-late-go')).map(({ identity, cgroup }) => [identity, cgroup]), [[EXECUTION_IDENTITY, inContainment('reclaim-late-go')]]);
  assert.equal(await readFile(lateStatus, 'utf8'), `${RECLAIM_EXIT.abandoned}\n`);
  assert.equal(await populatedNow('reclaim-late-go'), false);
  const deadStatus = await fifoIn(holds, 'status-dead');
  const program = reporting(deadStatus, [RECLAIM_PROGRAM_MAIN]);
  const orphaned = await launchedByDeadWorker([checkout, 'reclaim-dead-worker', CONTAINMENT_PARENT, String(EXECUTION.uid), JSON.stringify(program)]);
  assert.equal(await readFile(deadStatus, 'utf8'), `${RECLAIM_EXIT.abandoned}\n`);
  assert.equal(await populatedNow('reclaim-dead-worker'), false);
  assert.equal(await agentSucceeds(checkout, 'cat file'), 'text');
  assert.equal(await modeOf(file), 0o600);
  for (const containment of [eager.containment, late.containment, orphaned]) await windowed.release(containment);
  for (const made of [control, waiting]) await made.remove();
});

test('a Linux launch resolves only once its program is in its cgroup as the execution account', { timeout: FIFO_TEST_BOUND_MS }, async () => {
  const made = await accountCheckout();
  const { checkout, file } = made;
  const [arrived, release] = [await fifoIn(holds, 'arrived'), await fifoIn(holds, 'release')];
  const script = 'printf x > "$1"; cat "$2" > /dev/null; shift 2; exec "$@"';
  const held = linuxHost({ executable: '/bin/sh', args: ['-c', script, 'held', arrived, release, process.execPath, RECLAIM_PROGRAM_MAIN] });
  let settled = false;
  const launching = held.launch(checkout, 'reclaim-held').finally(() => {
    settled = true;
  });
  await readFile(arrived);
  const [settledWhileHeld, processesWhileHeld] = [settled, await processesOf('reclaim-held')];
  await writeFile(release, 'x');
  const launched = value(await launching);
  assert.deepEqual((await processesOf('reclaim-held')).map(({ identity, cgroup }) => [identity, cgroup]), [[EXECUTION_IDENTITY, inContainment('reclaim-held')]]);
  assert.equal(await launched.go(), 'succeeded');
  assert.equal(await modeOf(file), 0o660);
  assert.deepEqual([settledWhileHeld, processesWhileHeld], [false, []], 'held before its cgroup, the program is not ready');
  await held.release(launched.containment);
  await made.remove();
});

const containmentExists = async (name: string) => (await readdir(CONTAINMENT_PARENT)).includes(name);

test('a launch that fails or is not ready within its bound frees its empty cgroup', { timeout: FIFO_TEST_BOUND_MS }, async () => {
  const ended = linuxHost({ executable: '/bin/sh', args: ['-c', 'exit 1', 'reclaim'] });
  assert.equal(failed(await ended.launch('/nonexistent', 'reclaim-ended')).code, 'unavailable');
  assert.equal(await containmentExists('reclaim-ended'), false);
  const silent = new LinuxReclaimHost({
    containmentParent: CONTAINMENT_PARENT, executionAccount: EXECUTION, readyBoundMs: SHORT_BOUND_MS,
    program: { executable: '/bin/sh', args: ['-c', 'read go', 'reclaim'] },
  });
  assert.match(failed(await silent.launch('/nonexistent', 'reclaim-silent')).message, /not ready within its bound/);
  assert.equal(await containmentExists('reclaim-silent'), false);
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

// What the runner hands the adapter: its output after the redaction
// boundary, recorded by wrapping the runner's public methods.
async function withRunnerOutputs(run: (outputs: unknown[]) => Promise<void>): Promise<void> {
  const methods = ['run', 'runChecked', 'runParsed'] as const;
  const originals = methods.map((method) => GitRunner.prototype[method]);
  const outputs: unknown[] = [];
  methods.forEach((method, index) => {
    const original = originals[index] as (...args: unknown[]) => Promise<unknown>;
    (GitRunner.prototype as unknown as Record<string, unknown>)[method] = async function (this: GitRunner, ...args: unknown[]) {
      const result = await original.apply(this, args);
      outputs.push(result);
      return result;
    };
  });
  try {
    await run(outputs);
  } finally {
    methods.forEach((method, index) => ((GitRunner.prototype as unknown as Record<string, unknown>)[method] = originals[index]));
  }
}

// The worker's own output streams, recorded while `run` runs.
async function withWorkerOutput(run: () => Promise<void>): Promise<string> {
  const streams = [process.stdout, process.stderr];
  const writes = streams.map((stream) => stream.write);
  let written = '';
  for (const stream of streams) {
    const write = stream.write.bind(stream);
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      written += Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk);
      return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof stream.write;
  }
  try {
    await run();
  } finally {
    streams.forEach((stream, index) => (stream.write = writes[index]!));
  }
  return written;
}

const asText = (value: unknown) => JSON.stringify(value, (_, item: unknown) => (item instanceof Uint8Array ? Buffer.from(item).toString('latin1') : item));

test('no secret reaches a log, an output, a result, or a file of the data root', () => withLinuxFixture(async (git) => {
  const { fixture, local } = git;
  const results: Result<unknown>[] = [];
  let runnerOutputs: unknown[] = [];
  const workerOutput = await withWorkerOutput(() => withRunnerOutputs(async (outputs) => {
    runnerOutputs = outputs;
    results.push(await local.prepare(request(git)));
    await fixture.writeFile(FIRST, 'change.txt', 'change\n');
    await fixture.commitAll(FIRST, 'change');
    results.push(await local.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.write }));
    results.push(await local.push({ attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null }));
    git.remote.behavior = { kind: 'echo-authorization' };
    results.push(await local.readRemoteHead({ attemptId: FIRST, credential: fixture.credentials.write }));
    await fixture.writeFile(FIRST, 'later.txt', 'later\n');
    await fixture.commitAll(FIRST, 'later');
    results.push(await local.push({ attemptId: FIRST, credential: fixture.credentials.write, expectedRemoteHead: null }));
    results.push(await local.prepare(request(git, SECOND)));
  }));
  assert.deepEqual(results.slice(-3).map(({ ok }) => ok), [false, false, false], 'the echoing remote fails each operation');
  assert.ok(asText(runnerOutputs).includes(REDACTED_VALUE), 'the echoed credential reached the runner and was scrubbed');
  const forms = [fixture.credentials.read, fixture.credentials.write].flatMap(credentialForms);
  const argv = (await git.gitPlacements()).map(({ argv }) => argv.join(' ')).join('\n');
  const channels = { results: JSON.stringify(results), runner: asText(runnerOutputs), worker: workerOutput, argv, dataRoot: await allBytes(fixture.dataRoot) };
  const leaks = Object.entries(channels).flatMap(([channel, text]) => forms.filter((form) => text.includes(form)).map(() => channel));
  assert.deepEqual(leaks, []);
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
