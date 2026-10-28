import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ok } from '@taskelith/kernel';
import { CrashPoints, failed, id, value } from '@taskelith/testing';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import {
  GitWorkspaces,
  OperationChains,
  ProcessGroupReclaimHost,
  RECLAIM_PROGRAM_MAIN,
  parseHandOffRecord,
  type GitWorkspaceCrashPoint,
  type LaunchedReclaim,
  type ReclaimContainment,
  type ReclaimHost,
} from '@taskelith/git-workspace';
import { WORKSPACE_LAYOUT, WORKSPACE_MODES, type PrepareWorkspace } from '@taskelith/workspace';
import { CountingHost, createGitFixture, killedWorker, simulatedSeparateAccount, type GitFixture, type GitFixtureOptions } from './git-fixture.ts';

const FIRST = id('AttemptId', 'attempt-1') as AttemptId;
const SECOND = id('AttemptId', 'attempt-2') as AttemptId;
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const TASK = id('TaskId', 'task-1') as TaskId;
const SHORT_BOUND_MS = 600;

function request(git: GitFixture, attemptId = FIRST): PrepareWorkspace {
  const { binding, credentials } = git.fixture;
  return { attemptId, projectId: PROJECT, taskId: TASK, binding, target: { kind: 'task-branch' }, credential: credentials.read };
}

async function withFixture(run: (git: GitFixture) => Promise<void>, options: GitFixtureOptions = {}): Promise<void> {
  const git = await createGitFixture(options);
  try {
    await run(git);
  } finally {
    await git.dispose();
  }
}

// A shell program that signals readiness and waits for `go` like the
// fixed one, then runs `body`.
const shellProgram = (body: string) => ({ executable: '/bin/sh', args: ['-c', `echo ready; read go; ${body}`, 'reclaim'] });
const FAILING_PROGRAM = shellProgram('exit 1');
const failingHost = () => new CountingHost(simulatedSeparateAccount(new ProcessGroupReclaimHost(FAILING_PROGRAM)));

// Runs until the file `hold` is gone; the process group outlives a crash.
const holdingProgram = (hold: string) => shellProgram(`while [ -e '${hold}' ]; do sleep 0.05; done`);
const holdingHost = (hold: string) => new CountingHost(simulatedSeparateAccount(new ProcessGroupReclaimHost(holdingProgram(hold))));

const recordPath = (git: GitFixture, attemptId = FIRST) => join(git.checkout(attemptId), '..', WORKSPACE_LAYOUT.handOffRecord);
const readRecord = async (git: GitFixture) => parseHandOffRecord(await readFile(recordPath(git), 'utf8'));
const modeOf = async (path: string) => (await stat(path)).mode & 0o7777;

test('a hand-off opens the checkout to the execution group and a reclaim closes it', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  const checkout = git.checkout(FIRST);
  assert.equal((await stat(checkout)).gid, process.getgid!());
  assert.equal(await modeOf(join(checkout, '..')), WORKSPACE_MODES.attempt);
  value(await git.local.handOff(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutHandedOff);
  assert.equal(await modeOf(recordPath(git)), WORKSPACE_MODES.handOffRecord);
  assert.deepEqual(await readRecord(git), { containment: null, reclaimFailed: false });
  value(await git.local.reclaim(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
  assert.equal(await lstat(recordPath(git)).catch(() => undefined), undefined);
}, { reclaimHost: simulatedSeparateAccount() }));

test('on one account the hand-off and the reclaim change no mode of the checkout', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  const checkout = git.checkout(FIRST);
  value(await git.local.handOff(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
  value(await git.local.prepare(request(git, SECOND)));
  value(await git.local.handOff(SECOND));
  assert.deepEqual(await git.local.handedOff(), [FIRST, SECOND]);
  value(await git.local.reclaim(FIRST));
  assert.equal(await modeOf(checkout), WORKSPACE_MODES.checkoutReclaimed);
}));

test('the reclaim program gives the group what the agent wrote and replaces hard-linked files', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  value(await git.local.handOff(FIRST));
  await git.fixture.writeExecutable(FIRST, 'nested/run.sh', 'echo run\n');
  await git.fixture.writeFile(FIRST, 'nested/closed.txt', 'closed\n');
  const closed = join(git.checkout(FIRST), 'nested', 'closed.txt');
  const writeOutside = await git.fixture.hardLinkOutside(FIRST, 'nested/closed.txt');
  await chmod(closed, 0o4000);
  await chmod(join(git.checkout(FIRST), 'nested'), 0o1700);
  value(await git.local.reclaim(FIRST));
  assert.equal(await modeOf(join(git.checkout(FIRST), 'nested')), 0o2770);
  assert.equal(await modeOf(join(git.checkout(FIRST), 'nested', 'run.sh')), 0o770);
  assert.equal(await modeOf(closed), 0o660);
  assert.equal((await stat(closed)).nlink, 1);
  await writeOutside('outside\n');
  assert.equal(await readFile(closed, 'utf8'), 'closed\n');
}));

test('the containment is recorded once the program is ready, before go, and the record goes last', () => withFixture(async (git) => {
  const crashPoints = new CrashPoints();
  value(await git.local.prepare(request(git)));
  const local = git.reopen(crashPoints);
  value(await local.handOff(FIRST));
  value(await local.reclaim(FIRST));
  assert.deepEqual(crashPoints.reached, [
    'WS5.before', 'WS5.after', 'WS6.before', 'WS6.after',
    'WS7.before', 'WS7.after', 'WS8.before', 'WS8', 'WS8.after', 'WS9.before', 'WS9.after', 'WS10.before', 'WS10.after',
  ]);
}, { reclaimHost: simulatedSeparateAccount() }));

const HANDED_OFF_CRASHES: readonly GitWorkspaceCrashPoint[] = ['WS5.after', 'WS6.before', 'WS6.after'];
const RECLAIM_CRASHES: readonly GitWorkspaceCrashPoint[] = [
  'WS7.before', 'WS7.after', 'WS8.before', 'WS8', 'WS8.after', 'WS9.before', 'WS9.after', 'WS10.before',
];
const SEPARATE_ACCOUNT = { kind: 'separate-account' } as const;

test('a worker killed at WS5.before of a hand-off leaves a reclaimed workspace', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  await killedWorker(git, { operation: 'handOff', attemptId: FIRST, point: 'WS5.before', host: SEPARATE_ACCOUNT });
  const restarted = git.reopen();
  assert.deepEqual(await restarted.handedOff(), []);
  value(await restarted.inspect(FIRST));
  value(await restarted.handOff(FIRST));
  assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
}, { reclaimHost: simulatedSeparateAccount() }));

for (const point of HANDED_OFF_CRASHES) {
  test(`a worker killed at ${point} of a hand-off leaves a handed-off workspace that the next reclaim reclaims`, () => withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    await killedWorker(git, { operation: 'handOff', attemptId: FIRST, point, host: SEPARATE_ACCOUNT });
    const restarted = git.reopen();
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.equal(failed(await restarted.inspect(FIRST)).details.reason, 'workspace-handed-off');
    value(await restarted.reclaim(FIRST));
    assert.deepEqual(await restarted.handedOff(), []);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutReclaimed);
    value(await restarted.inspect(FIRST));
    value(await restarted.handOff(FIRST));
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
  }, { reclaimHost: simulatedSeparateAccount() }));
}

for (const point of RECLAIM_CRASHES) {
  test(`a worker killed at ${point} of a reclaim keeps the workspace handed off until a reclaim completes`, () => withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    await killedWorker(git, { operation: 'reclaim', attemptId: FIRST, point, host: SEPARATE_ACCOUNT });
    const restarted = git.reopen();
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.equal(failed(await restarted.inspect(FIRST)).details.reason, 'workspace-handed-off');
    value(await restarted.reclaim(FIRST));
    assert.deepEqual(await restarted.handedOff(), []);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutReclaimed);
    value(await restarted.inspect(FIRST));
  }, { reclaimHost: simulatedSeparateAccount() }));
}

test('a worker killed at WS10.after of a reclaim leaves a reclaimed workspace', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  value(await git.local.handOff(FIRST));
  await killedWorker(git, { operation: 'reclaim', attemptId: FIRST, point: 'WS10.after', host: SEPARATE_ACCOUNT });
  const restarted = git.reopen();
  assert.deepEqual(await restarted.handedOff(), []);
  assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutReclaimed);
  value(await restarted.inspect(FIRST));
  value(await restarted.reclaim(FIRST));
  value(await restarted.handOff(FIRST));
}, { reclaimHost: simulatedSeparateAccount() }));

// Without `abandon`, which SIGKILL skips: the closed input ends the program.
for (const point of ['WS7.after', 'WS8.before'] as const) {
  test(`a worker killed at ${point} leaves its waiting program to exit without a change`, () => {
    const host = new ProcessGroupReclaimHost();
    return withFixture(async (git) => {
      value(await git.local.prepare(request(git)));
      value(await git.local.handOff(FIRST));
      const agentFile = join(git.checkout(FIRST), 'agent-file');
      await writeFile(agentFile, 'text');
      await chmod(agentFile, 0o600);
      await killedWorker(git, { operation: 'reclaim', attemptId: FIRST, point, host: SEPARATE_ACCOUNT });
      const containment = (await readRecord(git))?.containment;
      assert.equal(containment?.kind, 'process-group');
      assert.equal(await waitUntilEmpty(host, containment!), true);
      assert.equal(await modeOf(agentFile), 0o600, 'the program changed nothing');
    }, { reclaimHost: simulatedSeparateAccount(host) });
  });
}

async function waitUntilEmpty(host: ReclaimHost, containment: ReclaimContainment): Promise<boolean> {
  for (let polls = 0; polls < 100; polls += 1) {
    if (!(await host.populated(containment))) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

test('a failed reclaim program keeps the workspace handed off and never runs again', () => {
  const host = failingHost();
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    for (const provider of [git.local, git.local, git.reopen()]) {
      assert.equal(failed(await provider.reclaim(FIRST)).details.reason, 'reclaim-failed');
    }
    assert.equal(host.launched.length, 1);
    assert.deepEqual(await readRecord(git), { containment: host.launched[0], reclaimFailed: true });
    assert.deepEqual(host.released[0], host.launched[0], 'the empty containment of the failed program is freed');
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
    value(await git.local.handOff(FIRST));
    assert.equal(failed(await git.local.reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(failed(await git.local.handOff(SECOND)).code, 'not-found');
  }, { reclaimHost: host });
});

type CleanupStep = 'kill' | 'populated' | 'release';

// A file system fault as Node raises it, with a path in its message.
const cleanupFault = (syscall: string) => Object.assign(new Error(`EIO: i/o error, ${syscall} '/private/checkout'`), { code: 'EIO', syscall });

// The first call of `step` meets a file system fault; every other call
// goes to the counting host it wraps.
function faultingOnce(step: CleanupStep, inner: CountingHost): ReclaimHost {
  let faulted = false;
  const once = <T>(name: CleanupStep, call: () => Promise<T>): Promise<T> => {
    if (name !== step || faulted) return call();
    faulted = true;
    return Promise.reject(cleanupFault(name));
  };
  return {
    executionAccount: inner.executionAccount,
    launch: async (checkout, containmentName) => {
      const launched = await inner.launch(checkout, containmentName);
      return launched.ok ? ok({ ...launched.value, kill: () => once('kill', () => launched.value.kill()) }) : launched;
    },
    populated: (containment) => once('populated', () => inner.populated(containment)),
    release: (containment) => once('release', () => inner.release(containment)),
    killRecorded: (containment) => inner.killRecorded(containment),
  };
}

for (const step of ['kill', 'populated', 'release'] as const) {
  test(`a fault at ${step} after a failed program still fails as reclaim-failed, and a later reclaim cleans up`, () => {
    const host = failingHost();
    return withFixture(async (git) => {
      value(await git.local.prepare(request(git)));
      value(await git.local.handOff(FIRST));
      const interrupted = failed(await git.local.reclaim(FIRST));
      assert.deepEqual([interrupted.details.reason, interrupted.message.includes('/private')], ['reclaim-failed', false]);
      assert.match(interrupted.message, /cleanup of its containment is unfinished/);
      const containment = host.launched[0]!;
      assert.deepEqual(await readRecord(git), { containment, reclaimFailed: true });
      assert.deepEqual(host.released, []);
      assert.equal(failed(await git.reopen().reclaim(FIRST)).details.reason, 'reclaim-failed');
      assert.deepEqual([host.killedRecorded, host.released], [[containment], [containment]], 'the restarted reclaim cleans up');
      assert.equal(host.launched.length, 1, 'the program never runs again');
      assert.deepEqual(await git.local.handedOff(), [FIRST]);
    }, { reclaimHost: faultingOnce(step, host) });
  });
}

test('a worker killed after a failed program and before its record runs the program once more', () => {
  const host = failingHost();
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    const crashed = { kind: 'separate-account', program: FAILING_PROGRAM } as const;
    await killedWorker(git, { operation: 'reclaim', attemptId: FIRST, point: 'WS8.after', host: crashed });
    assert.equal((await readRecord(git))?.reclaimFailed, false);
    assert.equal(failed(await git.reopen().reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(failed(await git.reopen().reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(host.launched.length, 1, 'the restarted worker ran it once');
  }, { reclaimHost: host });
});

test('a reclaim program that survives a killed worker holds the workspace until it is proven gone', async () => {
  const holdDirectory = await mkdtemp(join(tmpdir(), 'taskelith-reclaim-hold-'));
  const hold = join(holdDirectory, 'hold');
  await writeFile(hold, '');
  const host = holdingHost(hold);
  await withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.prepare(request(git, SECOND)));
    value(await git.local.handOff(FIRST));
    await killedWorker(git, { operation: 'reclaim', attemptId: FIRST, point: 'WS8', host: { kind: 'separate-account', program: holdingProgram(hold) } });
    const survivor = (await readRecord(git))?.containment;
    assert.equal(await host.populated(survivor!), true, 'the program got go and runs');
    const restarted = git.reopen();
    const started = Date.now();
    assert.equal(failed(await restarted.reclaim(FIRST)).code, 'unavailable');
    assert.ok(Date.now() - started >= SHORT_BOUND_MS, 'the proof polls up to its bound');
    assert.equal(failed(await restarted.handOff(FIRST)).code, 'unavailable');
    assert.equal(failed(await restarted.inspect(FIRST)).details.reason, 'workspace-handed-off');
    assert.equal(failed(await restarted.handOff(SECOND)).details.reason, 'other-workspace-handed-off');
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.equal(host.launched.length, 0, 'no program runs while one survives');
    assert.equal(await host.populated(survivor!), true, 'the surviving program is never killed');
    await rm(hold);
    value(await restarted.reclaim(FIRST));
    assert.equal(host.launched.length, 1);
    assert.deepEqual(await restarted.handedOff(), []);
  }, { reclaimHost: host, reclaimProofBoundMs: SHORT_BOUND_MS }).finally(() => rm(holdDirectory, { recursive: true, force: true }));
});

// Its first program misses a short window before the adapter can send
// `go`; later ones get the default window.
function lateGoHost(): ReclaimHost {
  const late: ReclaimHost = new ProcessGroupReclaimHost({ executable: process.execPath, args: [RECLAIM_PROGRAM_MAIN, '--go-within-ms', '50'] });
  const host = simulatedSeparateAccount();
  let launches = 0;
  return {
    ...host,
    launch: async (checkout, containmentName) => {
      launches += 1;
      if (launches > 1) return host.launch(checkout, containmentName);
      const launched = await late.launch(checkout, containmentName);
      if (launched.ok) await waitUntilEmpty(late, launched.value.containment);
      return launched;
    },
  };
}

test('a program that misses its window for go fails the reclaim as unavailable and a retry reclaims', () => {
  const host = new CountingHost(lateGoHost());
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    await writeFile(join(git.checkout(FIRST), 'agent-file'), 'text');
    await chmod(join(git.checkout(FIRST), 'agent-file'), 0o600);
    const missed = failed(await git.local.reclaim(FIRST));
    assert.equal(missed.code, 'unavailable');
    assert.equal(missed.details.reason, undefined);
    assert.equal((await readRecord(git))?.reclaimFailed, false);
    assert.equal(await modeOf(join(git.checkout(FIRST), 'agent-file')), 0o600, 'the program changed nothing');
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    assert.deepEqual(host.released, host.launched, 'the empty containment is freed');
    value(await git.local.reclaim(FIRST));
    assert.equal(await modeOf(join(git.checkout(FIRST), 'agent-file')), 0o660);
    assert.deepEqual(await git.local.handedOff(), []);
  }, { reclaimHost: host });
});

test('a launch that fails leaves the workspace handed off with its record', () => {
  const missing: ReclaimHost = simulatedSeparateAccount(new ProcessGroupReclaimHost({ executable: '/nonexistent/program', args: [] }));
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    assert.equal(failed(await git.local.reclaim(FIRST)).code, 'unavailable');
    assert.deepEqual(await readRecord(git), { containment: null, reclaimFailed: false });
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
  }, { reclaimHost: missing });
});

// Never signals readiness; it waits on its input, which abandon closes.
const SILENT_PROGRAM = { executable: '/bin/sh', args: ['-c', 'read go', 'reclaim'] };

test('a program that is not ready within its bound fails the reclaim as unavailable', { timeout: 20_000 }, () => {
  const host = new CountingHost(simulatedSeparateAccount(new ProcessGroupReclaimHost(SILENT_PROGRAM, SHORT_BOUND_MS)));
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    const late = failed(await git.local.reclaim(FIRST));
    assert.equal(late.code, 'unavailable');
    assert.equal(late.details.reason, undefined);
    assert.match(late.message, /not ready within its bound/);
    assert.deepEqual(await readRecord(git), { containment: null, reclaimFailed: false });
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    assert.equal(host.launched.length, 0);
  }, { reclaimHost: host });
});

test('a program still running at the run bound is killed and freed, and the workspace stays handed off', { timeout: 30_000 }, async () => {
  const holdDirectory = await mkdtemp(join(tmpdir(), 'taskelith-reclaim-hold-'));
  const hold = join(holdDirectory, 'hold');
  await writeFile(hold, '');
  const host = holdingHost(hold);
  await withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    assert.equal(failed(await git.local.reclaim(FIRST)).details.reason, 'reclaim-failed');
    const containment = host.launched[0]!;
    assert.deepEqual(await readRecord(git), { containment, reclaimFailed: true });
    assert.equal(await host.populated(containment), false, 'the program is killed and proven gone');
    assert.deepEqual(host.released, [containment], 'its empty containment is freed');
    assert.equal(failed(await git.reopen().reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(host.launched.length, 1, 'no retry');
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
  }, { reclaimHost: host, reclaimRunBoundMs: SHORT_BOUND_MS }).finally(() => rm(holdDirectory, { recursive: true, force: true }));
});

interface Signal {
  readonly promise: Promise<void>;
  resolve(): void;
}

function signal(): Signal {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

// Its program exits at once, and the release of its containment waits for
// the test; a poll during that release waits until the reclaim is done.
class GatedReleaseHost implements ReclaimHost {
  readonly executionAccount = { uid: process.getuid!(), gid: process.getgid!() };
  readonly releasing = signal();
  readonly polledDuringRelease = signal();
  reclaimed: Promise<unknown> = Promise.resolve();
  readonly #gate = signal();
  #inRelease = false;

  async launch() {
    const launched: LaunchedReclaim = {
      containment: { kind: 'process-group', id: 424242 }, go: async () => 'succeeded', abandon: () => {}, kill: async () => {},
    };
    return ok(launched);
  }

  async populated(): Promise<boolean> {
    if (!this.#inRelease) return false;
    this.polledDuringRelease.resolve();
    await this.reclaimed;
    return false;
  }

  async killRecorded(): Promise<void> {}

  async release(): Promise<void> {
    this.#inRelease = true;
    this.releasing.resolve();
    await this.#gate.promise;
    this.#inRelease = false;
  }

  openRelease(): void {
    this.#gate.resolve();
  }
}

// Signals when work of `path` arrives while other work of it runs or waits.
class ObservedChains extends OperationChains {
  readonly queuedBehindAnother = signal();
  path = '';

  override run<T>(path: string, work: () => Promise<T>): Promise<T> {
    if (path === this.path && this.busy(path)) this.queuedBehindAnother.resolve();
    return super.run(path, work);
  }
}

test('a hand-off that meets a running reclaim of its workspace waits until the reclaim is done', { timeout: 20_000 }, () => {
  const host = new GatedReleaseHost();
  const chains = new ObservedChains();
  return withFixture(async (git) => {
    chains.path = join(git.checkout(FIRST), '..');
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    const reclaiming = git.local.reclaim(FIRST);
    host.reclaimed = reclaiming;
    await host.releasing.promise;
    const handing = git.local.handOff(FIRST);
    const met = await Promise.race([
      chains.queuedBehindAnother.promise.then(() => 'queued'),
      host.polledDuringRelease.promise.then(() => 'polled during the release'),
    ]);
    assert.equal(met, 'queued');
    host.openRelease();
    value(await reclaiming);
    value(await handing);
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
  }, { reclaimHost: host, operationChains: chains });
});

test('two adapters of one process hand off two workspaces one at a time', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  value(await git.local.prepare(request(git, SECOND)));
  const results = await Promise.all([git.local.handOff(FIRST), git.reopen().handOff(SECOND)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(failed(results.find((result) => !result.ok)!).details.reason, 'other-workspace-handed-off');
  assert.equal((await git.local.handedOff()).length, 1);
}, { reclaimHost: simulatedSeparateAccount() }));

test('a hand-off record that cannot be read fails the operations without guessing', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  await writeFile(recordPath(git), '{"containment":');
  assert.equal(failed(await git.local.handOff(FIRST)).code, 'internal');
  assert.equal(failed(await git.local.reclaim(FIRST)).code, 'internal');
  assert.deepEqual(await git.local.handedOff(), [FIRST]);
  assert.equal(failed(await git.local.reclaim(SECOND)).code, 'not-found');
}));

const HANDED_OFF_RECORD = { containment: null, reclaimFailed: false };

test('the hand-off records are read from disk, also by a restarted adapter', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  value(await git.local.prepare(request(git, SECOND)));
  assert.deepEqual(await git.local.handOffRecords(), []);
  value(await git.local.handOff(FIRST));
  value(await git.local.handOff(SECOND));
  const failedRecord = { containment: { kind: 'cgroup', name: 'reclaim-attempt-2' }, reclaimFailed: true };
  await writeFile(recordPath(git, SECOND), JSON.stringify(failedRecord));
  const expected = [{ attemptId: FIRST, record: HANDED_OFF_RECORD }, { attemptId: SECOND, record: failedRecord }];
  assert.deepEqual(await git.local.handOffRecords(), expected);
  assert.deepEqual(await git.reopen().handOffRecords(), expected);
}));

test('a malformed or unreadable hand-off record rejects the read of the records', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  value(await git.local.handOff(FIRST));
  await writeFile(recordPath(git), '{"containment":');
  await assert.rejects(git.local.handOffRecords(), /is malformed/);
  await rm(recordPath(git));
  await mkdir(recordPath(git));
  await assert.rejects(git.local.handOffRecords(), { code: 'EISDIR' });
}));

test('a hand-off record removed between the listing and its read is left out', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  value(await git.local.prepare(request(git, SECOND)));
  value(await git.local.handOff(FIRST));
  value(await git.local.handOff(SECOND));
  // Removes a listed record before the records are read, as a reclaim may.
  class Vanishing extends GitWorkspaces {
    override async handedOff() {
      const listed = await super.handedOff();
      await rm(recordPath(git, FIRST));
      return listed;
    }
  }
  const vanishing = new Vanishing({ dataRoot: git.dataRoot, client: git.client, remoteTransport: 'https-or-loopback-http', reclaimHost: new ProcessGroupReclaimHost() });
  assert.deepEqual(await vanishing.handOffRecords(), [{ attemptId: SECOND, record: HANDED_OFF_RECORD }]);
}));

test('a hand-off record parses only its own shapes', () => {
  assert.deepEqual(parseHandOffRecord('{"containment":null,"reclaimFailed":false}'), { containment: null, reclaimFailed: false });
  assert.deepEqual(parseHandOffRecord('{"containment":{"kind":"cgroup","name":"reclaim-a"},"reclaimFailed":true}'), {
    containment: { kind: 'cgroup', name: 'reclaim-a' }, reclaimFailed: true,
  });
  assert.deepEqual(parseHandOffRecord('{"containment":{"kind":"process-group","id":42},"reclaimFailed":false}')?.containment, { kind: 'process-group', id: 42 });
  for (const text of ['', 'null', '[]', '{"containment":null}', '{"reclaimFailed":false}', '{"containment":{"kind":"cgroup","name":"../x"},"reclaimFailed":false}',
    '{"containment":{"kind":"process-group","id":1},"reclaimFailed":false}', '{"containment":{"kind":"other"},"reclaimFailed":false}']) {
    assert.equal(parseHandOffRecord(text), null, text);
  }
});

test('a started program that is abandoned exits without a change', async () => {
  const host: ReclaimHost = new ProcessGroupReclaimHost(shellProgram('exit 0'));
  const launched: LaunchedReclaim = value(await host.launch('/nonexistent', 'reclaim-x'));
  assert.equal(launched.containment.kind, 'process-group');
  launched.abandon();
  assert.equal(await waitUntilEmpty(host, launched.containment), true);
});
