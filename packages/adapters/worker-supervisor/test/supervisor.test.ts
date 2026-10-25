import assert from 'node:assert/strict';
import test from 'node:test';
import { CrashPoints, SimulatedCrash } from '@taskelith/testing';
import {
  adoptExecution,
  encodeEvent,
  encodeRecord,
  parseEvents,
  parseExit,
  parseHandle,
  parseLaunch,
  prepareRecord,
  recoverExecution,
  requestCancellation,
  superviseLaunch,
  type SupervisorOutcome,
} from '@taskelith/worker-supervisor';
import { identity, intent, rig, until, type Rig } from './fakes.ts';

async function prepared(platform: 'linux' | 'darwin' = 'darwin', crashPoint?: (point: string) => void): Promise<Rig> {
  const setup = rig(platform, crashPoint);
  assert.ok((await prepareRecord(setup.worker, intent())).ok);
  return setup;
}

function file(setup: Rig, name: string): string | undefined {
  return setup.store.files.get(name);
}

function events(setup: Rig) {
  const parsed = parseEvents(file(setup, 'events') ?? '');
  assert.ok(parsed.ok);
  return parsed.value;
}

async function finish(setup: Rig, run: Promise<SupervisorOutcome>, code: number | null, signal: string | null = null) {
  await until(() => file(setup, 'handle') !== undefined || file(setup, 'exit') !== undefined);
  setup.spawner.exit(code, signal);
  return run;
}

test('the first supervisor claims, spawns once, and records the exit when the group is gone', async () => {
  const setup = await prepared();
  const outcome = await finish(setup, superviseLaunch(setup.supervisor), 0);

  assert.deepEqual(outcome, { kind: 'exited', exit: { status: { kind: 'code', code: 0 }, startProven: true, termination: 'process-group-empty' } });
  assert.deepEqual(setup.points, ['CP2', 'CP5', 'CP6', 'CP7', 'CP8', 'CP9', 'CP11']);
  assert.deepEqual(parseLaunch(file(setup, 'launch')!), { ok: true, value: { kind: 'claim', launchAuthId: 'launch-1', supervisor: 1 } });
  assert.deepEqual(parseHandle(file(setup, 'handle')!), { ok: true, value: { kind: 'spawned', process: identity(500), processGroupId: 500 } });
  assert.equal(setup.spawner.spawned.length, 1);
  assert.equal(setup.lock.held, false);
  assert.ok(file(setup, 'supervisor.1'));
});

test('on Linux the child is born in its containment, and cancellation kills the containment', async () => {
  const setup = await prepared('linux');
  setup.fake.containmentPopulated = true;
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  assert.ok((await requestCancellation(setup.worker, 'requested')).ok);
  await until(() => setup.fake.containmentLog.includes('kill'));
  setup.spawner.exit(null, 'SIGKILL');
  const outcome = await run;

  assert.deepEqual(outcome, { kind: 'exited', exit: { status: { kind: 'signal', signal: 'SIGKILL' }, startProven: true, termination: 'containment-empty' } });
  assert.deepEqual(setup.fake.containmentLog, ['create', 'admit 100', 'release 100', 'kill', 'remove']);
  assert.deepEqual(parseLaunch(file(setup, 'launch')!), {
    ok: true,
    value: { kind: 'claim', launchAuthId: 'launch-1', supervisor: 1, containment: '/sys/fs/cgroup/executions/execution-1' },
  });
  assert.deepEqual(events(setup), [{ kind: 'cancellation', step: 'containment-killed' }]);
});

test('a supervisor seals instead of spawning when its checks fail', async () => {
  for (const [change, reason] of [
    [(setup: Rig) => void (setup.fake.bootId = 'boot-2'), 'boot-changed'],
    [(setup: Rig) => void (setup.fake.clockReadable = false), 'deadline-unreadable'],
    [(setup: Rig) => setup.fake.host.suspend(30_000), 'deadline-passed'],
  ] as const) {
    const setup = await prepared();
    change(setup);
    assert.deepEqual(await superviseLaunch(setup.supervisor), { kind: 'sealed', reason });
    assert.deepEqual(parseLaunch(file(setup, 'launch')!), { ok: true, value: { kind: 'seal', by: 'supervisor', reason } });
    assert.equal(setup.spawner.spawned.length, 0);
  }
});

test('a supervisor that cannot take the lock, is not the first, or finds a launch record does not spawn', async () => {
  const busy = await prepared();
  busy.lock.held = true;
  assert.deepEqual(await superviseLaunch(busy.supervisor), { kind: 'lock-busy' });

  const late = await prepared();
  late.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(99) }));
  assert.deepEqual(await superviseLaunch(late.supervisor), { kind: 'not-first' });
  assert.ok(late.store.files.has('supervisor.2'));

  const sealed = await prepared();
  sealed.store.files.set('launch', encodeRecord({ kind: 'seal', by: 'worker', reason: 'recovery' }));
  assert.deepEqual(await superviseLaunch(sealed.supervisor), {
    kind: 'launch-exists',
    launch: { kind: 'seal', by: 'worker', reason: 'recovery' },
  });

  const nameless = await prepared();
  nameless.fake.end(100);
  assert.deepEqual(await superviseLaunch(nameless.supervisor), { kind: 'sealed', reason: 'identity-unreadable' });
  assert.equal((await adoptExecution(nameless.supervisor)).kind, 'record-unusable');

  const missing = rig();
  await missing.store.createDirectory();
  assert.equal((await superviseLaunch(missing.supervisor)).kind, 'record-unusable');
  for (const setup of [busy, late, sealed, nameless, missing]) assert.equal(setup.spawner.spawned.length, 0);
});

test('a failed spawn ends with the failure and never spawns again', async () => {
  const setup = await prepared();
  setup.spawner.failure = 'spawn scripted-process ENOENT';

  assert.deepEqual(await superviseLaunch(setup.supervisor), {
    kind: 'exited',
    exit: { status: { kind: 'unknown' }, startProven: false, spawnFailure: 'spawn scripted-process ENOENT', termination: 'never-spawned' },
  });
  assert.deepEqual(parseHandle(file(setup, 'handle')!), { ok: true, value: { kind: 'spawn-failed', failure: 'spawn scripted-process ENOENT' } });
  const recovered = await recoverExecution(setup.worker, 'record');
  assert.ok(recovered.ok && recovered.value.fact === 'exited');
  assert.deepEqual(recovered.value.exit, (parseExit(file(setup, 'exit')!) as { value: unknown }).value);
  assert.equal(setup.spawner.spawned.length, 1);
});

test('a suspend that outlasts the deadline after the claim ends without a spawn', async () => {
  const setup = await prepared('darwin', (point) => {
    if (point === 'CP7') setup.fake.host.suspend(60_000);
  });

  const outcome = await superviseLaunch(setup.supervisor);
  assert.equal(outcome.kind, 'exited');
  assert.equal(setup.spawner.spawned.length, 0);
  assert.equal((parseHandle(file(setup, 'handle')!) as { value: { kind: string } }).value.kind, 'spawn-failed');
});

test('macOS cancellation signals the group while the child is unreaped', async () => {
  const setup = await prepared();
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  await requestCancellation(setup.worker, 'requested');
  await until(() => setup.spawner.signals.length === 2);
  setup.spawner.exit(null, 'SIGKILL');
  await run;

  assert.deepEqual(setup.spawner.signals, ['SIGTERM 500', 'SIGKILL 500']);
  assert.deepEqual(events(setup), [
    { kind: 'cancellation', step: 'terminate-sent' },
    { kind: 'cancellation', step: 'kill-sent' },
  ]);
});

test('an escaped descendant keeps the set unproven until it is gone', async () => {
  const setup = await prepared();
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  setup.fake.run({ identity: identity(501), parentPid: 500, processGroupId: 501 });
  await until(() => events(setup).length === 1);
  setup.spawner.exit(0);
  await until(() => events(setup).length === 2);
  assert.equal(file(setup, 'exit'), undefined);
  setup.fake.end(501);
  const outcome = await run;

  assert.deepEqual(events(setup), [
    { kind: 'descendant', process: identity(501) },
    { kind: 'survivors', processes: [identity(501)] },
  ]);
  assert.equal(outcome.kind, 'exited');
});

test('termination is proven only by two consecutive listings without the group', async () => {
  const setup = await prepared();
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  let raced = false;
  setup.fake.afterListing = () => {
    if (raced || setup.fake.processes.some((entry) => entry.processGroupId === 500)) return;
    raced = true;
    // A member the empty listing missed: forked while its parent was reaped.
    setup.fake.run({ identity: identity(502), parentPid: 1, processGroupId: 500 });
  };
  setup.spawner.exit(0);
  await until(() => events(setup).length === 1);
  assert.equal(file(setup, 'exit'), undefined);
  setup.fake.end(502);
  const listingsBefore = setup.fake.listings;
  const outcome = await run;

  assert.deepEqual(events(setup), [{ kind: 'survivors', processes: [identity(502)] }]);
  assert.equal(outcome.kind, 'exited');
  assert.ok(setup.fake.listings - listingsBefore >= 2);
});

test('a durable write that fails after the spawn is retried while the child runs', async () => {
  const setup = await prepared();
  setup.store.failing.add('handle');
  const run = superviseLaunch(setup.supervisor);
  await until(() => setup.spawner.spawned.length === 1);
  for (let tick = 0; tick < 20; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(file(setup, 'handle'), undefined);
  setup.store.failing.delete('handle');
  await finish(setup, run, 0);

  assert.ok(file(setup, 'handle'));
  assert.equal(setup.spawner.spawned.length, 1);
});

const CRASH_RESULTS = {
  darwin: { CP5: 'not-started', CP6: 'not-started', CP7: 'uncertain', CP8: 'uncertain', CP9: 'adopted', CP11: 'exited' },
  linux: { CP5: 'not-started', CP6: 'not-started', CP7: 'exited', CP8: 'adopted', CP9: 'adopted', CP11: 'exited' },
} as const;

for (const platform of ['darwin', 'linux'] as const) {
  for (const [point, fact] of Object.entries(CRASH_RESULTS[platform])) {
    test(`a ${platform} supervisor crash at ${point} recovers as section 6 assigns, without a second spawn`, async () => {
      const crashes = new CrashPoints({ point, occurrence: 1, action: 'throw' });
      const setup = await prepared(platform, (reached) => crashes.reach(reached));
      // The containment holds the child from CP8 until the child exits.
      setup.fake.containmentPopulated = point === 'CP8' || point === 'CP9';
      const run = superviseLaunch(setup.supervisor);
      if (point === 'CP11') await finish(setup, run, 0).catch(() => undefined);
      await assert.rejects(run, SimulatedCrash);

      const recovered = await recoverExecution(setup.worker, 'record');
      assert.ok(recovered.ok);
      assert.equal(recovered.value.fact, fact);
      // Recovery never spawns; it starts an adopter where section 6 says.
      assert.deepEqual(setup.started, fact === 'adopted' ? ['adopt'] : []);
      assert.equal(setup.spawner.spawned.length, ['CP8', 'CP9', 'CP11'].includes(point) ? 1 : 0);
    });
  }
}

test('an adopting Linux supervisor watches the containment and records an unknown exit', async () => {
  const setup = await prepared('linux');
  setup.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1, containment: '/sys/fs/cgroup/executions/execution-1' }));
  setup.store.files.set('handle', encodeRecord({ kind: 'spawned', process: identity(500), processGroupId: 500 }));
  setup.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(99) }));
  setup.fake.containmentPopulated = true;
  const run = adoptExecution(setup.supervisor);
  await until(() => setup.store.files.has('supervisor.2'));
  await requestCancellation(setup.worker, 'requested');
  const outcome = await run;

  assert.deepEqual(outcome, { kind: 'exited', exit: { status: { kind: 'unknown' }, startProven: true, termination: 'containment-empty' } });
  assert.ok(setup.fake.containmentLog.includes('kill'));
});

test('an adopting macOS supervisor only observes, and records a cancellation as not applied', async () => {
  const setup = await prepared();
  setup.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1 }));
  setup.store.files.set('handle', encodeRecord({ kind: 'spawned', process: identity(500), processGroupId: 500 }));
  setup.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(99) }));
  setup.fake.run({ identity: identity(500), parentPid: 1, processGroupId: 500 });
  const run = adoptExecution(setup.supervisor);
  await requestCancellation(setup.worker, 'requested');
  await until(() => events(setup).length === 1);
  setup.fake.end(500);

  assert.deepEqual(await run, { kind: 'child-gone' });
  assert.deepEqual(events(setup), [{ kind: 'cancellation', step: 'not-applied' }]);
  assert.deepEqual(setup.spawner.signals, []);
});

test('an adopter without a readable claim or a matching containment adopts nothing', async () => {
  const unclaimed = await prepared();
  assert.equal((await adoptExecution(unclaimed.supervisor)).kind, 'record-unusable');

  const first = await prepared();
  first.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1 }));
  assert.deepEqual(await adoptExecution(first.supervisor), { kind: 'record-unusable', reason: 'a claim without a first supervisor record' });

  const elsewhere = await prepared('linux');
  elsewhere.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(99) }));
  elsewhere.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1, containment: '/elsewhere' }));
  assert.equal((await adoptExecution(elsewhere.supervisor)).kind, 'record-unusable');

  const handleless = await prepared();
  handleless.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(99) }));
  handleless.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1 }));
  assert.equal((await adoptExecution(handleless.supervisor)).kind, 'record-unusable');
});

test('a child is never spawned outside its containment, and the supervisor leaves it before watching', async () => {
  const refused = await prepared('linux');
  refused.fake.failures.set('admit', 1);
  const outcome = await superviseLaunch(refused.supervisor);
  assert.equal(outcome.kind, 'exited');
  assert.match(outcome.kind === 'exited' ? outcome.exit.spawnFailure ?? '' : '', /cannot enter the containment/);
  assert.equal(refused.spawner.spawned.length, 0);
  assert.ok(refused.fake.containmentLog.includes('remove'));

  const stuck = await prepared('linux');
  stuck.fake.failures.set('release', 3);
  stuck.fake.containmentPopulated = false;
  const run = superviseLaunch(stuck.supervisor);
  await until(() => file(stuck, 'handle') !== undefined);
  stuck.spawner.exit(0);
  await run;
  assert.deepEqual(stuck.fake.containmentLog.slice(0, 3), ['create', 'admit 100', 'release 100']);
});

test('a containment kill that fails is retried and recorded only once it succeeds', async () => {
  const setup = await prepared('linux');
  setup.fake.containmentPopulated = true;
  setup.fake.failures.set('kill', 2);
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  await requestCancellation(setup.worker, 'requested');
  await until(() => setup.fake.containmentLog.includes('kill'));
  setup.spawner.exit(null, 'SIGKILL');
  await run;

  assert.deepEqual(events(setup), [{ kind: 'cancellation', step: 'containment-killed' }]);
});

test('a containment that stays unreadable ends the wait without an exit', async () => {
  const launched = await prepared('linux');
  launched.fake.containmentPopulated = true;
  const run = superviseLaunch(launched.supervisor);
  await until(() => file(launched, 'handle') !== undefined);
  launched.fake.containmentPopulated = undefined;
  launched.spawner.exit(0);
  assert.deepEqual(await run, { kind: 'containment-unreadable' });
  assert.equal(file(launched, 'exit'), undefined);

  const adopted = await prepared('linux');
  adopted.store.files.set('supervisor.1', encodeRecord({ serial: 1, process: identity(99) }));
  adopted.store.files.set('launch', encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1, containment: '/sys/fs/cgroup/executions/execution-1' }));
  assert.deepEqual(await adoptExecution(adopted.supervisor), { kind: 'containment-unreadable' });
  assert.equal(adopted.lock.held, false);
});

test('a failed write before the spawn is reported as such and spawns nothing', async () => {
  const claim = await prepared();
  claim.store.failing.add('launch');
  assert.deepEqual(await superviseLaunch(claim.supervisor), { kind: 'write-failed', file: 'launch' });

  const sealing = await prepared();
  sealing.fake.bootId = 'boot-2';
  sealing.store.failing.add('launch');
  assert.deepEqual(await superviseLaunch(sealing.supervisor), { kind: 'write-failed', file: 'launch' });

  const record = await prepared();
  record.store.failing.add('supervisor.1');
  assert.deepEqual(await superviseLaunch(record.supervisor), { kind: 'write-failed', file: 'supervisor record' });
  for (const setup of [claim, sealing, record]) assert.equal(setup.spawner.spawned.length, 0);
});

test('a lost claim removes the containment it created', async () => {
  const setup = await prepared('linux');
  const createOnce = setup.store.createOnce.bind(setup.store);
  setup.store.createOnce = async (name, text) => {
    if (name === 'launch') setup.store.files.set('launch', encodeRecord({ kind: 'seal', by: 'worker', reason: 'recovery' }));
    return createOnce(name, text);
  };

  assert.equal((await superviseLaunch(setup.supervisor)).kind, 'launch-exists');
  assert.deepEqual(setup.fake.containmentLog, ['create', 'remove']);
});

test('macOS cancellation signals nothing once the child is reaped', async () => {
  const after = await prepared();
  const run = superviseLaunch(after.supervisor);
  await until(() => file(after, 'handle') !== undefined);
  after.spawner.exit(0);
  await run;
  await requestCancellation(after.worker, 'requested');
  assert.deepEqual(after.spawner.signals, []);

  // The grace period ends only when the test lets it, after the child exited.
  const during = await prepared();
  let endGrace: () => void = () => undefined;
  const graceOver = new Promise<void>((resolve) => (endGrace = resolve));
  const sleep = (milliseconds: number) => (milliseconds === 7 ? graceOver : during.supervisor.sleep(milliseconds));
  const timing = { ...during.supervisor.timing, graceMilliseconds: 7 };
  const graced = superviseLaunch({ ...during.supervisor, sleep, timing });
  await until(() => file(during, 'handle') !== undefined);
  await requestCancellation(during.worker, 'requested');
  await until(() => during.spawner.signals.length === 1);
  during.spawner.exit(null, 'SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));
  endGrace();
  await graced;
  assert.deepEqual(during.spawner.signals, ['SIGTERM 500']);
});

test('a damaged event log proves nothing: the supervisor ends without an exit', async () => {
  const setup = await prepared();
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  setup.store.files.set('events', '12:00000000:{"broken":tru}\nnext\n');
  setup.spawner.exit(0);

  assert.deepEqual(await run, { kind: 'termination-unprovable' });
  assert.equal(file(setup, 'exit'), undefined);
  assert.equal(setup.lock.held, false);
});

test('without a readable child identity the supervisor still cancels its group and ends without an exit', async () => {
  const setup = await prepared();
  const identityOf = setup.supervisor.platform.inspector.identity;
  const platform = {
    ...setup.supervisor.platform,
    inspector: { ...setup.supervisor.platform.inspector, identity: (pid: number) => (pid === 500 ? identityOf(9999) : identityOf(pid)) },
  };
  const run = superviseLaunch({ ...setup.supervisor, platform });
  await until(() => setup.spawner.spawned.length === 1);
  await requestCancellation(setup.worker, 'requested');
  await until(() => setup.spawner.signals.length === 2);
  setup.spawner.exit(null, 'SIGKILL');
  await run;

  assert.equal(file(setup, 'handle'), undefined);
  assert.deepEqual(setup.spawner.signals, ['SIGTERM 500', 'SIGKILL 500']);
});

test('a supervisor that cannot leave the containment gives up without a fact', async () => {
  const setup = await prepared('linux');
  setup.fake.failures.set('release', 99);

  assert.deepEqual(await superviseLaunch(setup.supervisor), { kind: 'containment-unusable' });
  assert.equal(file(setup, 'exit'), undefined);
  assert.equal(setup.spawner.spawned.length, 1);
});

test('a torn event entry is cut off before the next one is written', async () => {
  const setup = await prepared('linux');
  setup.store.files.set('events', `${encodeEvent({ kind: 'cancellation', step: 'terminate-sent' })}17:abc`);
  setup.fake.containmentPopulated = true;
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  await requestCancellation(setup.worker, 'requested');
  await until(() => setup.fake.containmentLog.includes('kill'));
  setup.spawner.exit(null, 'SIGKILL');
  await run;

  assert.deepEqual(events(setup), [
    { kind: 'cancellation', step: 'terminate-sent' },
    { kind: 'cancellation', step: 'containment-killed' },
  ]);
});

test('a lock that cannot be opened is reported apart from a busy one', async () => {
  const setup = await prepared();
  const lock = { tryAcquire: () => ({ ok: false as const, error: { code: 'internal' as const, message: 'not a lock', details: {} } }) };
  assert.deepEqual(await superviseLaunch({ ...setup.supervisor, lock }), { kind: 'lock-unusable', reason: 'not a lock' });
});

test('a spawn failure whose records cannot be written ends without holding the lock', async () => {
  const setup = await prepared();
  setup.spawner.failure = 'ENOENT';
  setup.store.failing.add('handle');

  assert.deepEqual(await superviseLaunch(setup.supervisor), { kind: 'write-failed', file: 'handle' });
  assert.equal(setup.lock.held, false);
});

test('a record that cannot be listed is reported as unusable, not as a failed write', async () => {
  const setup = await prepared();
  setup.store.list = async () => ({ ok: false, error: { code: 'unavailable', message: 'no listing', details: {} } });
  assert.deepEqual(await superviseLaunch(setup.supervisor), { kind: 'record-unusable', reason: 'cannot list the record' });
});

test('a descendant whose record cannot be written is recorded on a later walk', async () => {
  const setup = await prepared();
  const run = superviseLaunch(setup.supervisor);
  await until(() => file(setup, 'handle') !== undefined);
  setup.store.failing.add('events');
  setup.fake.run({ identity: identity(501), parentPid: 500, processGroupId: 500 });
  for (let tick = 0; tick < 10; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  setup.store.failing.delete('events');
  await until(() => file(setup, 'events') !== undefined);
  setup.fake.end(501);
  setup.spawner.exit(0);
  await run;

  assert.deepEqual(events(setup), [{ kind: 'descendant', process: identity(501) }]);
});
