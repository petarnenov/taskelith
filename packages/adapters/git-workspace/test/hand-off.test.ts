import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CrashPoints, failed, id, value } from '@taskelith/testing';
import type { AttemptId } from '@taskelith/execution';
import type { ProjectId, TaskId } from '@taskelith/sdlc';
import {
  ProcessGroupReclaimHost,
  RECLAIM_PROGRAM_MAIN,
  parseHandOffRecord,
  type GitWorkspaceCrashPoint,
  type LaunchedReclaim,
  type ReclaimContainment,
  type ReclaimHost,
} from '@taskelith/git-workspace';
import { WORKSPACE_LAYOUT, WORKSPACE_MODES, type PrepareWorkspace } from '@taskelith/workspace';
import { CountingHost, createGitFixture, simulatedSeparateAccount, type GitFixture, type GitFixtureOptions } from './git-fixture.ts';

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

// A shell program that waits for `go` like the fixed one, then runs `body`.
const shellProgram = (body: string) => ({ executable: '/bin/sh', args: ['-c', `read go; ${body}`, 'reclaim'] });
const failingHost = () => new CountingHost(simulatedSeparateAccount(new ProcessGroupReclaimHost(shellProgram('exit 1'))));

// Runs until the file `hold` is gone; the process group outlives a crash.
function holdingHost(hold: string) {
  return new CountingHost(simulatedSeparateAccount(new ProcessGroupReclaimHost(shellProgram(`while [ -e '${hold}' ]; do sleep 0.05; done`))));
}

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

test('the containment is recorded before the program starts and the record goes last', () => withFixture(async (git) => {
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

// Whether the workspace is still handed off after a crash at each point.
const HAND_OFF_CRASHES: readonly [GitWorkspaceCrashPoint, boolean][] = [
  ['WS5.before', false], ['WS5.after', true], ['WS6.before', true], ['WS6.after', true],
];
const RECLAIM_CRASHES: readonly GitWorkspaceCrashPoint[] = [
  'WS7.before', 'WS7.after', 'WS8.before', 'WS8', 'WS8.after', 'WS9.before', 'WS9.after', 'WS10.before',
];

for (const [point, handedOff] of HAND_OFF_CRASHES) {
  test(`a crash at ${point} of a hand-off leaves ${handedOff ? 'a handed-off' : 'a reclaimed'} workspace`, () => withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    await assert.rejects(git.reopen(new CrashPoints({ point, occurrence: 1, action: 'throw' })).handOff(FIRST), { name: 'SimulatedCrash' });
    const restarted = git.reopen();
    assert.deepEqual(await restarted.handedOff(), handedOff ? [FIRST] : []);
    value(await restarted.handOff(FIRST));
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
  }, { reclaimHost: simulatedSeparateAccount() }));
}

for (const point of RECLAIM_CRASHES) {
  test(`a crash at ${point} of a reclaim keeps the workspace handed off until a reclaim completes`, () => withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    await assert.rejects(git.reopen(new CrashPoints({ point, occurrence: 1, action: 'throw' })).reclaim(FIRST), { name: 'SimulatedCrash' });
    const restarted = git.reopen();
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.equal(failed(await restarted.inspect(FIRST)).details.reason, 'workspace-handed-off');
    value(await restarted.reclaim(FIRST));
    assert.deepEqual(await restarted.handedOff(), []);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutReclaimed);
    value(await restarted.inspect(FIRST));
  }, { reclaimHost: simulatedSeparateAccount() }));
}

test('a crash after the record is written leaves no started program behind', () => {
  const host = new CountingHost(simulatedSeparateAccount());
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    await assert.rejects(git.reopen(new CrashPoints({ point: 'WS7.after', occurrence: 1, action: 'throw' })).reclaim(FIRST), { name: 'SimulatedCrash' });
    const [containment] = host.launched;
    assert.deepEqual((await readRecord(git))?.containment, containment);
    assert.equal(await waitUntilEmpty(host, containment!), true);
  }, { reclaimHost: host });
});

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
    assert.deepEqual(await git.local.handedOff(), [FIRST]);
    assert.equal(await modeOf(git.checkout(FIRST)), WORKSPACE_MODES.checkoutHandedOff);
    value(await git.local.handOff(FIRST));
    assert.equal(failed(await git.local.reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(failed(await git.local.handOff(SECOND)).code, 'not-found');
  }, { reclaimHost: host });
});

test('a crash after a failed program and before its record runs the program once more', () => {
  const host = failingHost();
  return withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.handOff(FIRST));
    await assert.rejects(git.reopen(new CrashPoints({ point: 'WS8.after', occurrence: 1, action: 'throw' })).reclaim(FIRST), { name: 'SimulatedCrash' });
    assert.equal((await readRecord(git))?.reclaimFailed, false);
    assert.equal(failed(await git.reopen().reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(failed(await git.reopen().reclaim(FIRST)).details.reason, 'reclaim-failed');
    assert.equal(host.launched.length, 2);
  }, { reclaimHost: host });
});

test('a reclaim program that survives a crash holds the workspace until it is proven gone', async () => {
  const holdDirectory = await mkdtemp(join(tmpdir(), 'taskelith-reclaim-hold-'));
  const hold = join(holdDirectory, 'hold');
  await writeFile(hold, '');
  const host = holdingHost(hold);
  await withFixture(async (git) => {
    value(await git.local.prepare(request(git)));
    value(await git.local.prepare(request(git, SECOND)));
    value(await git.local.handOff(FIRST));
    await assert.rejects(git.reopen(new CrashPoints({ point: 'WS8', occurrence: 1, action: 'throw' })).reclaim(FIRST), { name: 'SimulatedCrash' });
    const restarted = git.reopen();
    const started = Date.now();
    assert.equal(failed(await restarted.reclaim(FIRST)).code, 'unavailable');
    assert.ok(Date.now() - started >= SHORT_BOUND_MS, 'the proof polls up to its bound');
    assert.equal(failed(await restarted.handOff(FIRST)).code, 'unavailable');
    assert.equal(failed(await restarted.inspect(FIRST)).details.reason, 'workspace-handed-off');
    assert.equal(failed(await restarted.handOff(SECOND)).details.reason, 'other-workspace-handed-off');
    assert.deepEqual(await restarted.handedOff(), [FIRST]);
    assert.equal(host.launched.length, 1, 'no program runs while one survives');
    assert.equal(await host.populated(host.launched[0]!), true, 'the surviving program is never killed');
    await rm(hold);
    value(await restarted.reclaim(FIRST));
    assert.equal(host.launched.length, 2);
    assert.deepEqual(await restarted.handedOff(), []);
  }, { reclaimHost: host, reclaimProofBoundMs: SHORT_BOUND_MS }).finally(() => rm(holdDirectory, { recursive: true, force: true }));
});

// Its first program misses a short window before the adapter can send
// `go`; later ones get the default window.
function lateGoHost(): ReclaimHost {
  const late = new ProcessGroupReclaimHost({ executable: process.execPath, args: [RECLAIM_PROGRAM_MAIN, '--go-within-ms', '50'] });
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

test('a program that misses its window for go fails the reclaim as unavailable and a retry reclaims', () => withFixture(async (git) => {
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
  value(await git.local.reclaim(FIRST));
  assert.equal(await modeOf(join(git.checkout(FIRST), 'agent-file')), 0o660);
  assert.deepEqual(await git.local.handedOff(), []);
}, { reclaimHost: lateGoHost() }));

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

test('a hand-off record that cannot be read fails the operations without guessing', () => withFixture(async (git) => {
  value(await git.local.prepare(request(git)));
  await writeFile(recordPath(git), '{"containment":');
  assert.equal(failed(await git.local.handOff(FIRST)).code, 'internal');
  assert.equal(failed(await git.local.reclaim(FIRST)).code, 'internal');
  assert.deepEqual(await git.local.handedOff(), [FIRST]);
  assert.equal(failed(await git.local.reclaim(SECOND)).code, 'not-found');
}));

test('a hand-off record parses only its own shapes', () => {
  assert.deepEqual(parseHandOffRecord('{"containment":null,"reclaimFailed":false}'), { containment: null, reclaimFailed: false });
  assert.deepEqual(parseHandOffRecord('{"containment":{"kind":"cgroup","name":"reclaim-a"},"reclaimFailed":true}'), {
    containment: { kind: 'cgroup', name: 'reclaim-a' }, reclaimFailed: true,
  });
  assert.deepEqual(parseHandOffRecord('{"containment":{"kind":"process-group","id":42},"reclaimFailed":false}')?.containment, { kind: 'process-group', id: 42 });
  for (const text of ['', 'null', '[]', '{"containment":null}', '{"containment":{"kind":"cgroup","name":"../x"},"reclaimFailed":false}',
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
