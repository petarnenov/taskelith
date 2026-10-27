import assert from 'node:assert/strict';
import test from 'node:test';
import { withholdCoverageFromDescendants } from '@taskelith/testing';
import {
  darwinPlatform,
  encodeRecord,
  loadDarwinNative,
  NodeSpawner,
  prepareRecord,
  readReportedFacts,
  recoverExecution,
  removeRecord,
  sealLaunch,
  startDetachedProcess,
  startSupervisor,
  superviseLaunch,
} from '@taskelith/worker-supervisor';
import { identity, intent, rig, SUPERVISOR_PID, type Rig } from './fakes.ts';

// The Node spawner passes this environment to the children it kills.
withholdCoverageFromDescendants();

const CLAIM = encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1 });
const HANDLE = encodeRecord({ kind: 'spawned', process: identity(500), processGroupId: 500 });

async function prepared(platform: 'linux' | 'darwin' = 'darwin'): Promise<Rig> {
  const setup = rig(platform);
  assert.ok((await prepareRecord(setup.worker, intent())).ok);
  return setup;
}

async function fact(setup: Rig, journaled: 'intent' | 'record' = 'record', exhausted = false) {
  const recovered = await recoverExecution(setup.worker, journaled, exhausted);
  assert.ok(recovered.ok, JSON.stringify(recovered));
  return recovered.value;
}

test('intent can be replaced only while no launch record exists', async () => {
  const setup = await prepared();
  assert.ok((await prepareRecord(setup.worker, intent({ launchAuthId: 'launch-2' }))).ok);
  setup.store.files.set('launch', CLAIM);

  assert.equal((await prepareRecord(setup.worker, intent({ launchAuthId: 'launch-3' }))).ok, false);
  assert.ok(setup.store.files.get('intent')!.includes('launch-2'));
});

test('starting the supervisor is crash point CP4', async () => {
  const setup = await prepared();
  assert.ok((await startSupervisor(setup.worker)).ok);
  assert.deepEqual(setup.started, ['launch']);
  assert.deepEqual(setup.points, ['CP2', 'CP4']);
});

test('a crash before the record is journaled seals and reports not started once the seal is read back', async () => {
  const setup = rig();
  assert.deepEqual(await fact(setup, 'intent'), { fact: 'not-started' });
  assert.ok(setup.store.files.get('launch')!.includes('"seal"'));
});

test('a seal that loses to a claim is decided again from the claim', async () => {
  const setup = await prepared();
  setup.store.files.set('launch', CLAIM);
  setup.store.files.set('handle', HANDLE);
  setup.fake.run({ identity: identity(500), parentPid: 1, processGroupId: 500 });

  const winner = await sealLaunch(setup.worker);
  assert.ok(winner.ok);
  assert.equal(winner.value.kind, 'claim');
  assert.deepEqual(await fact(setup, 'intent'), { fact: 'adopted', supervisor: 'started' });
  assert.deepEqual(setup.started, ['adopt']);
});

test('a record deleted after it was journaled is uncertain, not not-started', async () => {
  const setup = await prepared();
  setup.store.files.clear();
  setup.store.directory = false;

  assert.equal((await fact(setup)).fact, 'uncertain');
});

test('a live supervisor is adopted only while its recorded identity is alive', async () => {
  const setup = await prepared();
  setup.store.files.set('launch', CLAIM);
  setup.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(SUPERVISOR_PID) }));
  setup.lock.held = true;
  assert.deepEqual(await fact(setup), { fact: 'adopted', supervisor: 'live' });

  setup.fake.end(SUPERVISOR_PID);
  assert.deepEqual(await fact(setup), { fact: 'retry' });
  assert.equal((await fact(setup, 'record', true)).fact, 'uncertain');
  assert.deepEqual(setup.started, []);
});

test('a reused process ID is not the child: the execution is uncertain and nothing is signalled', async () => {
  const setup = await prepared();
  setup.store.files.set('launch', CLAIM);
  setup.store.files.set('handle', HANDLE);
  setup.fake.run({ identity: identity(500, 99_999), parentPid: 1, processGroupId: 500 });

  assert.equal((await fact(setup)).fact, 'uncertain');
  assert.deepEqual(setup.started, []);
  assert.deepEqual(setup.spawner.signals, []);
});

test('recovery completes a spawn failure and writes an unknown exit after a reboot', async () => {
  const failed = await prepared();
  failed.store.files.set('launch', CLAIM);
  failed.store.files.set('handle', encodeRecord({ kind: 'spawn-failed', failure: 'ENOENT' }));
  assert.deepEqual(await fact(failed), {
    fact: 'exited',
    exit: { status: { kind: 'unknown' }, startProven: false, spawnFailure: 'ENOENT', termination: 'never-spawned' },
  });

  const rebooted = await prepared('linux');
  rebooted.store.files.set('launch', CLAIM);
  rebooted.store.files.set('handle', HANDLE);
  rebooted.fake.bootId = 'boot-2';
  assert.deepEqual(await fact(rebooted), { fact: 'exited', exit: { status: { kind: 'unknown' }, startProven: true, termination: 'boot-changed' } });
});

test('after a container replacement an execution is uncertain, because the old namespace may live', async () => {
  const setup = rig('linux');
  assert.ok((await prepareRecord(setup.worker, intent({ namespaceIncarnation: 'pid:[1]' }))).ok);
  setup.store.files.set('launch', CLAIM);
  setup.fake.namespace = 'pid:[2]';
  setup.fake.containmentPopulated = false;

  assert.equal((await fact(setup)).fact, 'uncertain');
});

test('a corrupt or newer-format record is uncertain', async () => {
  const setup = await prepared();
  setup.store.files.set('launch', JSON.stringify({ format: 99, kind: 'claim' }));
  assert.equal((await fact(setup)).fact, 'uncertain');
  const facts = await readReportedFacts(setup.worker);
  assert.ok(facts.ok);
  assert.equal(facts.value.problems[0]?.kind, 'newer-format');
});

test('the record is removed only while the worker holds the lock, the launch record last', async () => {
  const setup = await prepared();
  setup.store.files.set('launch', encodeRecord({ kind: 'seal', by: 'worker', reason: 'recovery' }));
  setup.lock.held = true;
  assert.equal((await removeRecord(setup.worker)).ok, false);
  assert.equal(setup.store.directory, true);

  setup.lock.held = false;
  const removed: string[] = [];
  const remove = setup.store.remove.bind(setup.store);
  setup.store.remove = async (name) => {
    removed.push(name);
    return remove(name);
  };
  assert.ok((await removeRecord(setup.worker)).ok);
  assert.deepEqual(removed, ['intent', 'launch']);

  const ordered = await prepared();
  for (const name of ['launch', 'lock', 'lock-journal', 'supervisor.1', 'handle', 'exit']) ordered.store.files.set(name, '{}');
  const order: string[] = [];
  const removeOrdered = ordered.store.remove.bind(ordered.store);
  ordered.store.remove = async (name) => {
    order.push(name);
    return removeOrdered(name);
  };
  assert.ok((await removeRecord(ordered.worker)).ok);
  assert.deepEqual(order.slice(-4), ['intent', 'lock', 'lock-journal', 'launch']);
  assert.equal(setup.store.directory, false);
  assert.equal(setup.lock.held, false);
});

test('a supervisor whose macOS native calls cannot load seals every launch', async () => {
  const setup = rig();
  assert.ok((await prepareRecord(setup.worker, intent())).ok);
  const platform = darwinPlatform(loadDarwinNative('/nonexistent/libSystem.dylib'));
  const outcome = await superviseLaunch({ ...setup.supervisor, platform });

  assert.deepEqual(outcome, { kind: 'sealed', reason: 'identity-unreadable' });
  assert.equal(setup.spawner.spawned.length, 0);
});

test('the Node spawner starts a detached child, reports its exit, and reports a failed spawn', async () => {
  const spawner = new NodeSpawner();
  const child = await spawner.spawn({ executable: process.execPath, arguments: ['-e', 'process.exit(3)'] }, undefined);
  assert.equal(child.kind, 'spawned');
  assert.deepEqual(await (child as { exited: Promise<unknown> }).exited, { code: 3, signal: null });

  const sleeper = await spawner.spawn({ executable: process.execPath, arguments: ['-e', 'setTimeout(() => {}, 60000)'] }, undefined);
  assert.equal(sleeper.kind, 'spawned');
  spawner.signalGroup((sleeper as { pid: number }).pid, 'SIGKILL');
  assert.deepEqual(await (sleeper as { exited: Promise<unknown> }).exited, { code: null, signal: 'SIGKILL' });
  spawner.signalGroup((sleeper as { pid: number }).pid, 'SIGKILL');

  const missing = await spawner.spawn({ executable: '/nonexistent/scripted-process', arguments: [] }, undefined);
  assert.equal(missing.kind, 'failed');
});

test('intent is final once a supervisor record exists', async () => {
  const setup = await prepared();
  setup.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(SUPERVISOR_PID) }));
  assert.equal((await prepareRecord(setup.worker, intent({ launchAuthId: 'launch-9' }))).ok, false);
});

test('a Linux intent without its namespace incarnation proves no namespace current', async () => {
  const setup = rig('linux');
  const { namespaceIncarnation: _incarnation, ...withoutIncarnation } = intent();
  assert.ok((await prepareRecord(setup.worker, withoutIncarnation)).ok);
  setup.store.files.set('launch', CLAIM);
  setup.fake.containmentPopulated = false;

  assert.equal((await fact(setup)).fact, 'uncertain');
});

test('a failed detached start is reported, not thrown', async () => {
  assert.equal((await startDetachedProcess({ executable: '/nonexistent/supervisor', arguments: [] })).ok, false);
});

test('recovery takes as evidence only the containment that the claim names', async () => {
  const setup = await prepared('linux');
  setup.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1, containment: '/old/parent/execution-1' }));
  setup.store.files.set('handle', HANDLE);
  setup.fake.containmentPopulated = true;

  assert.equal((await fact(setup)).fact, 'uncertain');
  assert.deepEqual(setup.started, []);
});
