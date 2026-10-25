import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { CrashPoints, SimulatedCrash } from '@taskelith/testing';
import {
  adoptExecution,
  checkLinuxContainment,
  linuxPlatform,
  NodeSpawner,
  prepareRecord,
  recoverExecution,
  requestCancellation,
  superviseLaunch,
  type Platform,
  type SupervisorDependencies,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';
import { intent, MemoryLock, MemoryRecordStore } from './fakes.ts';

// Runs only in the privileged container of make verify-linux-cgroup, where
// the namespace's cgroup root is writable and a leaf holds every process.
const CGROUP = '/sys/fs/cgroup';
const PARENT = `${CGROUP}/executions`;
const HOME = `${CGROUP}/init`;
const ACCOUNT = { uid: 2000, gid: 2000 };

interface Setup {
  readonly store: MemoryRecordStore;
  readonly platform: Platform;
  readonly supervisor: SupervisorDependencies;
  readonly worker: WorkerSupervisionDependencies;
}

async function setup(executionId: string, script: string, crashPoint: (point: string) => void = () => undefined): Promise<Setup> {
  const platform = linuxPlatform({ containmentParent: PARENT });
  const store = new MemoryRecordStore();
  const lock = new MemoryLock();
  const now = platform.clock.read();
  assert.ok(now.ok);
  const supervisor: SupervisorDependencies = {
    store,
    lock,
    platform,
    spawner: new NodeSpawner(),
    selfPid: process.pid,
    timing: { pollMilliseconds: 50, graceMilliseconds: 200, retryMilliseconds: 50 },
    sleep: (milliseconds) => delay(milliseconds),
    crashPoint,
  };
  const worker: WorkerSupervisionDependencies = { store, lock, platform, startSupervisor: () => ({ ok: true, value: undefined }), crashPoint: () => undefined };
  const record = intent({
    executionId,
    deadline: { bootId: now.value.bootId, milliseconds: now.value.milliseconds + 30_000 },
    command: { executable: process.execPath, arguments: ['-e', script] },
    executionAccount: ACCOUNT,
  });
  assert.ok((await prepareRecord(worker, record)).ok);
  return { store, platform, supervisor, worker };
}

// The child starts a descendant in its own session, which leaves the child's
// process group but not its containment.
const ESCAPING_CHILD = `
const { spawn } = require('node:child_process');
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { detached: true, stdio: 'ignore' }).unref();
`;

test('the self-check proves a delegated containment that the execution account cannot leave', () => {
  assert.deepEqual(checkLinuxContainment({ cgroupRoot: CGROUP, containmentParent: PARENT, home: HOME, account: ACCOUNT }), { ok: true, value: undefined });
});

test('the execution stays started until the containment empties, also after a descendant escapes its group', async () => {
  const { supervisor } = await setup('execution-escape', ESCAPING_CHILD);
  const started = Date.now();
  const outcome = await superviseLaunch(supervisor);

  assert.deepEqual(outcome, { kind: 'exited', exit: { status: { kind: 'code', code: 0 }, startProven: true, termination: 'containment-empty' } });
  assert.ok(Date.now() - started >= 1000);
});

test('a child cannot move itself out of its containment', async () => {
  const script = `
try { require('node:fs').writeFileSync('${HOME}/cgroup.procs', String(process.pid)); process.exit(0); }
catch (error) { process.exit(error.code === 'EACCES' || error.code === 'EPERM' ? 13 : 1); }`;
  const { supervisor } = await setup('execution-move', script);

  const outcome = await superviseLaunch(supervisor);
  assert.equal(outcome.kind, 'exited');
  assert.deepEqual(outcome.kind === 'exited' && outcome.exit.status, { kind: 'code', code: 13 });
});

test('cancellation kills the whole containment, descendants included', async () => {
  const script = `${ESCAPING_CHILD}; setTimeout(() => {}, 60000);`;
  const { supervisor, worker } = await setup('execution-cancel', script);
  const run = superviseLaunch(supervisor);
  await delay(500);
  assert.ok((await requestCancellation(worker, 'requested')).ok);

  const outcome = await run;
  assert.deepEqual(outcome, { kind: 'exited', exit: { status: { kind: 'signal', signal: 'SIGKILL' }, startProven: true, termination: 'containment-empty' } });
});

test('after a supervisor crash at CP9 the populated containment is adopted and its end recorded', async () => {
  const crashes = new CrashPoints({ point: 'CP9', occurrence: 1, action: 'throw' });
  const { supervisor, worker } = await setup('execution-adopt', 'setTimeout(() => {}, 1000)', (point) => crashes.reach(point));
  await assert.rejects(superviseLaunch(supervisor), SimulatedCrash);

  const recovered = await recoverExecution(worker, 'record');
  assert.deepEqual(recovered, { ok: true, value: { fact: 'adopted' } });
  assert.deepEqual(await adoptExecution(supervisor), {
    kind: 'exited',
    exit: { status: { kind: 'unknown' }, startProven: true, termination: 'containment-empty' },
  });
});
