import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { crashEnvironment, ScenarioProcess, withholdCoverageFromDescendants } from '@taskelith/testing';
import {
  darwinPlatform,
  FileRecordStore,
  loadDarwinNative,
  parseEvents,
  parseExit,
  prepareRecord,
  recoverExecution,
  requestCancellation,
  runSupervisorProgram,
  SqliteExecutionLock,
  startDetachedSupervisor,
  type ExitRecord,
  type SupervisorMode,
  type WorkerSupervisionDependencies,
} from '@taskelith/worker-supervisor';
import { intent } from './fakes.ts';
import { ProcessReaper, REAL_PROCESS_TEST_TIMEOUT } from './process-reaper.ts';

// The supervisor programs, which kill their children, spawn with process.env.
withholdCoverageFromDescendants();

// Real processes under the macOS native readers; the Linux counterpart is
// linux-cgroup.privileged.ts.
const DARWIN = { skip: process.platform !== 'darwin', timeout: REAL_PROCESS_TEST_TIMEOUT };
const SCENARIO = new URL('./fixtures/supervisor-scenario.ts', import.meta.url).pathname;
const ROOT = mkdtempSync(join(tmpdir(), 'taskelith-darwin-'));
const platform = darwinPlatform(loadDarwinNative());
const reaper = new ProcessReaper(ROOT);

interface Execution {
  readonly directory: string;
  readonly spawns: string;
  readonly worker: WorkerSupervisionDependencies;
}

// The child appends one line to `spawns` each time it starts, so a test can
// prove that an execution spawned at most once.
async function prepare(executionId: string, body: string): Promise<Execution> {
  const directory = join(ROOT, executionId);
  const spawns = join(ROOT, `${executionId}-spawns`);
  const worker: WorkerSupervisionDependencies = {
    store: new FileRecordStore(directory),
    lock: new SqliteExecutionLock(directory),
    platform,
    startSupervisor: async () => ({ ok: true, value: undefined }),
    crashPoint: () => undefined,
  };
  const now = platform.clock.read();
  assert.ok(now.ok, JSON.stringify(now));
  const { namespaceIncarnation: _linuxOnly, ...record } = intent({
    executionId,
    deadline: { bootId: now.value.bootId, milliseconds: now.value.milliseconds + 30_000 },
    command: { executable: process.execPath, arguments: ['-e', `require('node:fs').appendFileSync(${JSON.stringify(spawns)}, 'spawn\\n'); ${body}`] },
  });
  assert.ok((await prepareRecord(worker, record)).ok);
  return { directory, spawns, worker };
}

async function startSupervisor(execution: Execution, mode: SupervisorMode, crashPoint?: string): Promise<ScenarioProcess> {
  return reaper.track(await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', SCENARIO, mode, execution.directory], {
    env: { ...process.env, ...(crashPoint === undefined ? {} : crashEnvironment(crashPoint)) },
  }));
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

async function recordedEvents(execution: Execution) {
  const text = await execution.worker.store.read('events');
  assert.ok(text.ok && text.value !== undefined);
  const events = parseEvents(text.value);
  assert.ok(events.ok);
  return events.value;
}

// A descendant in its own session leaves the child's process group.
const ESCAPE = `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)', ${JSON.stringify(ROOT)}], { detached: true, stdio: 'ignore' }).unref();`;
// A descendant in the child's group, which a group signal reaches.
const MEMBER = `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', ${JSON.stringify(ROOT)}], { stdio: 'ignore' }).unref();`;

test.afterEach(() => reaper.reap());
test.after(() => rmSync(ROOT, { recursive: true, force: true }));

test('on macOS the supervisor program launches the child and proves its exit', DARWIN, async () => {
  const execution = await prepare('execution-launch', 'process.exit(3)');
  const outcome = await runSupervisorProgram(['launch', execution.directory]);

  const exit = { status: { kind: 'code', code: 3 }, startProven: true, termination: 'process-group-empty' };
  assert.deepEqual(outcome, { ok: true, value: { kind: 'exited', exit } });
  assert.deepEqual(await recordedExit(execution), exit);
  assert.equal(spawnCount(execution), 1);
});

test('on macOS a detached supervisor launches the child and proves its exit', DARWIN, async () => {
  const execution = await prepare('execution-detached', 'process.exit(0)');
  assert.ok((await startDetachedSupervisor({ mode: 'launch', directory: execution.directory })).ok);
  await until(() => existsSync(join(execution.directory, 'exit')));

  assert.deepEqual((await recordedExit(execution)).status, { kind: 'code', code: 0 });
});

test('on macOS an escaped descendant holds the exit until it is gone', DARWIN, async () => {
  const execution = await prepare('execution-escape', `${ESCAPE} setTimeout(() => {}, 500);`);
  const started = Date.now();
  const supervisor = await startSupervisor(execution, 'launch');
  assert.deepEqual(await supervisor.exited, { code: 0, signal: null });

  assert.ok(Date.now() - started >= 1500);
  const kinds = (await recordedEvents(execution)).map((entry) => entry.kind);
  assert.deepEqual([...new Set(kinds)], ['descendant', 'survivors']);
  assert.equal((await recordedExit(execution)).termination, 'process-group-empty');
});

test('on macOS cancellation signals the whole process group', DARWIN, async () => {
  const execution = await prepare('execution-cancel', `${MEMBER} setTimeout(() => {}, 60000);`);
  const supervisor = await startSupervisor(execution, 'launch');
  await until(() => existsSync(join(execution.directory, 'handle')));
  await delay(300);
  assert.ok((await requestCancellation(execution.worker, 'requested')).ok);
  assert.deepEqual(await supervisor.exited, { code: 0, signal: null });

  assert.deepEqual(await recordedExit(execution), { status: { kind: 'signal', signal: 'SIGTERM' }, startProven: true, termination: 'process-group-empty' });
});

// What the recovery table of contract section 6 assigns on macOS after a
// supervisor is killed right after each step.
const AFTER_CRASH = { CP5: 'not-started', CP6: 'not-started', CP7: 'uncertain', CP8: 'uncertain', CP9: 'adopted', CP11: 'exited' } as const;

for (const [point, fact] of Object.entries(AFTER_CRASH)) {
  test(`on macOS a supervisor killed at ${point} recovers as section 6 assigns and never spawns twice`, DARWIN, async () => {
    const execution = await prepare(`execution-${point.toLowerCase()}`, 'setTimeout(() => {}, 800)');
    const supervisor = await startSupervisor(execution, 'launch', point);
    assert.deepEqual(await supervisor.exited, { code: null, signal: 'SIGKILL' });

    assert.equal((await recover(execution)).fact, fact);
    // An adopter only observes, so once the child is gone, its descendants
    // are unknown and the execution is uncertain.
    if (fact === 'adopted') {
      const adopter = await startSupervisor(execution, 'adopt');
      assert.deepEqual(await adopter.exited, { code: 0, signal: null });
      assert.equal(existsSync(join(execution.directory, 'exit')), false);
      assert.equal((await recover(execution)).fact, 'uncertain');
    }
    assert.ok(spawnCount(execution) <= 1);
  });
}

test('on macOS a worker restart adopts a live supervisor and leaves its child running', DARWIN, async () => {
  const execution = await prepare('execution-restart', 'setTimeout(() => {}, 1000)');
  const supervisor = await startSupervisor(execution, 'launch');
  await until(() => existsSync(join(execution.directory, 'handle')));

  assert.deepEqual(await recover(execution), { fact: 'adopted', supervisor: 'live' });
  assert.deepEqual(await supervisor.exited, { code: 0, signal: null });
  assert.deepEqual((await recordedExit(execution)).status, { kind: 'code', code: 0 });
});
