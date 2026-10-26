import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { crashEnvironment, ScenarioProcess } from '@taskelith/testing';
import {
  checkLinuxContainment,
  FileRecordStore,
  linuxPlatform,
  parseExit,
  prepareRecord,
  recoverExecution,
  requestCancellation,
  SqliteExecutionLock,
  type ExitRecord,
  type SupervisorMode,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';
import { intent } from './fakes.ts';

// Runs only in the privileged container of make verify-linux-cgroup, where
// the namespace's cgroup root is writable and a leaf holds every process.
const CGROUP = '/sys/fs/cgroup';
const PARENT = `${CGROUP}/executions`;
const HOME = `${CGROUP}/init`;
const ACCOUNT = { uid: 2000, gid: 2000 };
const SCENARIO = new URL('./fixtures/supervisor-scenario.ts', import.meta.url).pathname;
const ROOT = mkdtempSync(join(tmpdir(), 'taskelith-executions-'));
// The execution account passes through to its spawn counter only.
chmodSync(ROOT, 0o711);
const platform = linuxPlatform({ containmentParent: PARENT });

interface Execution {
  readonly directory: string;
  readonly spawns: string;
  readonly worker: WorkerSupervisionDependencies;
}

// The child appends one line to `spawns` each time it starts, so a test can
// prove that an execution spawned at most once.
function childScript(spawns: string, body: string): string {
  return `require('node:fs').appendFileSync(${JSON.stringify(spawns)}, 'spawn\\n'); ${body}`;
}

async function prepare(executionId: string, body: string): Promise<Execution> {
  const directory = join(ROOT, executionId);
  const scratch = join(ROOT, `${executionId}-spawns`);
  mkdirSync(scratch, { mode: 0o777 });
  chmodSync(scratch, 0o777);
  const spawns = join(scratch, 'spawns');
  const store = new FileRecordStore(directory);
  const lock = new SqliteExecutionLock(directory);
  const worker: WorkerSupervisionDependencies = {
    store,
    lock,
    platform,
    startSupervisor: async () => ({ ok: true, value: undefined }),
    crashPoint: () => undefined,
  };
  const now = platform.clock.read();
  const incarnation = platform.namespaceIncarnation();
  assert.ok(now.ok && incarnation?.ok);
  const record = intent({
    executionId,
    namespaceIncarnation: incarnation.value,
    deadline: { bootId: now.value.bootId, milliseconds: now.value.milliseconds + 30_000 },
    command: { executable: process.execPath, arguments: ['-e', childScript(spawns, body)] },
    executionAccount: ACCOUNT,
  });
  assert.ok((await prepareRecord(worker, record)).ok);
  return { directory, spawns, worker };
}

function startSupervisor(execution: Execution, mode: SupervisorMode, crashPoint?: string): Promise<ScenarioProcess> {
  return ScenarioProcess.start(
    process.execPath,
    ['--experimental-strip-types', SCENARIO, mode, execution.directory, '--containment-parent', PARENT],
    { env: { ...process.env, ...(crashPoint === undefined ? {} : crashEnvironment(crashPoint)) } },
  );
}

function spawnCount(execution: Execution): number {
  return existsSync(execution.spawns) ? readFileSync(execution.spawns, 'utf8').split('\n').filter(Boolean).length : 0;
}

async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await delay(25);
  assert.ok(condition());
}

async function recover(execution: Execution) {
  const recovered = await recoverExecution(execution.worker, 'record');
  assert.ok(recovered.ok, JSON.stringify(recovered));
  return recovered.value;
}

async function recordedExit(execution: Execution): Promise<ExitRecord> {
  const text = await execution.worker.store.read('exit');
  assert.ok(text.ok && text.value !== undefined);
  const exit = parseExit(text.value);
  assert.ok(exit.ok);
  return exit.value;
}

// The child starts a descendant in its own session, which leaves the child's
// process group but not its containment.
const ESCAPE = `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { detached: true, stdio: 'ignore' }).unref();`;

test.after(() => rmSync(ROOT, { recursive: true, force: true }));

test('the self-check proves a delegated containment that the execution account cannot leave', () => {
  assert.deepEqual(checkLinuxContainment({ cgroupRoot: CGROUP, containmentParent: PARENT, home: HOME, account: ACCOUNT }), { ok: true, value: undefined });
});

test('the execution stays started until the containment empties, also after a descendant escapes its group', async () => {
  const execution = await prepare('execution-escape', ESCAPE);
  const started = Date.now();
  const supervisor = await startSupervisor(execution, 'launch');
  assert.deepEqual(await supervisor.exited, { code: 0, signal: null });

  assert.ok(Date.now() - started >= 1000);
  assert.deepEqual(await recordedExit(execution), { status: { kind: 'code', code: 0 }, startProven: true, termination: 'containment-empty' });
  assert.equal(spawnCount(execution), 1);
});

test('a child cannot move itself out of its containment', async () => {
  const body = `try { require('node:fs').writeFileSync('${HOME}/cgroup.procs', String(process.pid)); process.exit(0); }
catch (error) { process.exit(error.code === 'EACCES' || error.code === 'EPERM' ? 13 : 1); }`;
  const execution = await prepare('execution-move', body);
  await (await startSupervisor(execution, 'launch')).exited;

  assert.deepEqual((await recordedExit(execution)).status, { kind: 'code', code: 13 });
});

test('cancellation kills the whole containment, descendants included', async () => {
  const execution = await prepare('execution-cancel', `${ESCAPE} setTimeout(() => {}, 60000);`);
  const supervisor = await startSupervisor(execution, 'launch');
  await delay(500);
  assert.ok((await requestCancellation(execution.worker, 'requested')).ok);
  await supervisor.exited;

  assert.deepEqual(await recordedExit(execution), { status: { kind: 'signal', signal: 'SIGKILL' }, startProven: true, termination: 'containment-empty' });
});

// What the recovery table of contract section 6 assigns on Linux after a
// supervisor is killed right after each step.
const AFTER_CRASH = { CP5: 'not-started', CP6: 'not-started', CP7: 'exited', CP8: 'adopted', CP9: 'adopted', CP11: 'exited' } as const;

for (const [point, fact] of Object.entries(AFTER_CRASH)) {
  test(`a supervisor killed at ${point} recovers as section 6 assigns and never spawns twice`, async () => {
    const execution = await prepare(`execution-${point.toLowerCase()}`, 'setTimeout(() => {}, 800)');
    const supervisor = await startSupervisor(execution, 'launch', point);
    assert.deepEqual(await supervisor.exited, { code: null, signal: 'SIGKILL' });

    const recovered = await recover(execution);
    assert.equal(recovered.fact, fact);
    if (fact === 'adopted') {
      const adopter = await startSupervisor(execution, 'adopt');
      assert.deepEqual(await adopter.exited, { code: 0, signal: null });
      assert.deepEqual(await recordedExit(execution), { status: { kind: 'unknown' }, startProven: point === 'CP9', termination: 'containment-empty' });
    }
    assert.ok(spawnCount(execution) <= 1);
  });
}

test('a worker restart adopts a live supervisor and leaves its process set running', async () => {
  const execution = await prepare('execution-restart', 'setTimeout(() => {}, 1000)');
  const supervisor = await startSupervisor(execution, 'launch');
  // The worker recovers only after it started the supervisor (section 6).
  await until(() => existsSync(join(execution.directory, 'handle')));

  assert.deepEqual(await recover(execution), { fact: 'adopted', supervisor: 'live' });
  assert.deepEqual(await supervisor.exited, { code: 0, signal: null });
  assert.deepEqual((await recordedExit(execution)).status, { kind: 'code', code: 0 });
});

test('a supervisor and then its adopter are killed: each recovery adopts again, and the exit is unknown', async () => {
  const execution = await prepare('execution-twice', 'setTimeout(() => {}, 2500)');
  const launcher = await startSupervisor(execution, 'launch');
  await until(() => existsSync(join(execution.directory, 'handle')));
  launcher.kill('SIGKILL');
  await launcher.exited;
  assert.deepEqual(await recover(execution), { fact: 'adopted', supervisor: 'started' });
  const first = await startSupervisor(execution, 'adopt');
  await until(() => existsSync(join(execution.directory, 'supervisor.2')));
  first.kill('SIGKILL');
  await first.exited;

  assert.deepEqual(await recover(execution), { fact: 'adopted', supervisor: 'started' });
  const second = await startSupervisor(execution, 'adopt');
  assert.deepEqual(await second.exited, { code: 0, signal: null });
  assert.equal((await recordedExit(execution)).status.kind, 'unknown');
  assert.ok(existsSync(join(execution.directory, 'supervisor.3')));
  assert.equal(spawnCount(execution), 1);
});

test('a recorded execution whose directory is deleted is uncertain, not not-started', async () => {
  const execution = await prepare('execution-deleted', 'process.exit(0)');
  rmSync(execution.directory, { recursive: true, force: true });

  assert.equal((await recover(execution)).fact, 'uncertain');
});
