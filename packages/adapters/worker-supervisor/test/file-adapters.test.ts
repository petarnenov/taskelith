import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ScenarioProcess, uncoveredEnvironment } from '@taskelith/testing';
import {
  FileRecordStore,
  hostPlatform,
  parseProgramArguments,
  prepareRecord,
  recoverExecution,
  removeRecord,
  runSupervisorProgram,
  SqliteExecutionLock,
  supervisorCommand,
  supervisorMain,
} from '@taskelith/worker-supervisor';
import { intent, rig } from './fakes.ts';

function scratch(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-supervisor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('the file store creates once, replaces, appends, lists records only, and removes', async (t) => {
  const store = new FileRecordStore(join(scratch(t), 'execution-1'));
  assert.deepEqual(await store.exists(), { ok: true, value: false });
  assert.deepEqual(await store.read('intent'), { ok: true, value: undefined });
  assert.equal((await store.list()).ok, false);
  assert.ok((await store.createDirectory()).ok);
  assert.ok((await store.createDirectory()).ok);
  assert.deepEqual(await store.exists(), { ok: true, value: true });

  assert.deepEqual(await store.createOnce('launch', 'claim\n'), { ok: true, value: 'created' });
  assert.deepEqual(await store.createOnce('launch', 'seal\n'), { ok: true, value: 'exists' });
  assert.deepEqual(await store.read('launch'), { ok: true, value: 'claim\n' });
  assert.ok((await store.replace('intent', 'one\n')).ok);
  assert.ok((await store.replace('intent', 'two\n')).ok);
  assert.ok((await store.append('events', 'a\n')).ok);
  assert.ok((await store.append('events', 'b\n')).ok);
  assert.deepEqual(await store.read('events'), { ok: true, value: 'a\nb\n' });
  writeFileSync(join(store.directory, '.intent.tmp-0001'), 'torn');
  const listed = await store.list();
  assert.ok(listed.ok);
  assert.deepEqual([...listed.value].sort(), ['events', 'intent', 'launch']);

  assert.equal((await store.removeDirectory()).ok, false);
  for (const name of ['events', 'intent', 'launch', 'missing']) assert.ok((await store.remove(name)).ok);
  assert.ok((await store.removeDirectory()).ok);
  assert.deepEqual(await store.exists(), { ok: true, value: false });
});

test('the file store reports a directory it cannot create or read', async (t) => {
  const root = scratch(t);
  writeFileSync(join(root, 'file'), '');
  const store = new FileRecordStore(join(root, 'file', 'execution-1'));
  assert.equal((await store.createDirectory()).ok, false);
  assert.equal((await store.exists()).ok, false);
  assert.equal((await store.read('intent')).ok, false);
  assert.equal((await store.createOnce('intent', 'x')).ok, false);
  assert.equal((await store.append('events', 'x')).ok, false);
  assert.equal((await store.remove('intent')).ok, false);
});

test('the execution lock is exclusive within a process and across processes, and released on exit', async (t) => {
  const directory = scratch(t);
  const lock = new SqliteExecutionLock(directory);
  const held = lock.tryAcquire();
  assert.ok(held.ok && held.value !== undefined);
  assert.deepEqual(new SqliteExecutionLock(directory).tryAcquire(), { ok: true, value: undefined });
  held.value.release();

  const holder = await ScenarioProcess.start(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import('@taskelith/worker-supervisor').then(({ SqliteExecutionLock }) => {
       const held = new SqliteExecutionLock(${JSON.stringify(directory)}).tryAcquire();
       console.log(held.ok && held.value ? 'held' : 'busy');
       setTimeout(() => {}, 60000);
     });`,
  ], { env: uncoveredEnvironment() });
  await holder.waitForOutput('held');
  assert.deepEqual(lock.tryAcquire(), { ok: true, value: undefined });
  holder.kill('SIGKILL');
  await holder.exited;
  const again = lock.tryAcquire();
  assert.ok(again.ok && again.value !== undefined);
  again.value.release();

  writeFileSync(join(directory, 'lock'), 'not a database, only text that SQLite cannot read as one');
  assert.equal(lock.tryAcquire().ok, false);
});

test('a sealed record on disk is removed with its lock files, the launch record last', async (t) => {
  const directory = join(scratch(t), 'execution-1');
  const setup = rig();
  const worker = { ...setup.worker, store: new FileRecordStore(directory), lock: new SqliteExecutionLock(directory) };
  assert.ok((await prepareRecord(worker, intent())).ok);
  const probe = worker.lock.tryAcquire();
  assert.ok(probe.ok && probe.value !== undefined);
  probe.value.release();
  assert.deepEqual(await recoverExecution(worker, 'record'), { ok: true, value: { fact: 'not-started' } });

  assert.ok((await removeRecord(worker)).ok);
  assert.deepEqual(await worker.store.exists(), { ok: true, value: false });
});

test('the supervisor program takes a mode, its directory, and on Linux the containment parent', () => {
  assert.deepEqual(parseProgramArguments(['launch', '/d']), { ok: true, value: { mode: 'launch', directory: '/d' } });
  assert.deepEqual(parseProgramArguments(['adopt', '/d', '--containment-parent', '/cg']), {
    ok: true,
    value: { mode: 'adopt', directory: '/d', containmentParent: '/cg' },
  });
  for (const argv of [[], ['run', '/d'], ['launch'], ['launch', '/d', '--other', '/x'], ['launch', '/d', '--containment-parent']]) {
    assert.equal(parseProgramArguments(argv).ok, false, argv.join(' '));
  }
  const command = supervisorCommand({ mode: 'adopt', directory: '/d', containmentParent: '/cg' });
  assert.equal(command.executable, process.execPath);
  assert.match(command.arguments[0]!, /supervisor-main\.js$/);
  assert.deepEqual(command.arguments.slice(1), ['adopt', '/d', '--containment-parent', '/cg']);

  assert.equal(hostPlatform(undefined, 'darwin').ok, true);
  assert.equal(hostPlatform('/cg', 'linux').ok, true);
  assert.equal(hostPlatform(undefined, 'linux').ok, false);
  assert.equal(hostPlatform(undefined, 'win32').ok, false);
});

test('a usage error or an unsupported platform starts no supervisor', async () => {
  assert.equal((await runSupervisorProgram(['run'])).ok, false);
  assert.equal(await supervisorMain(['run']), 2);
  if (process.platform === 'linux') assert.equal((await runSupervisorProgram(['launch', '/nonexistent'])).ok, false);
});

