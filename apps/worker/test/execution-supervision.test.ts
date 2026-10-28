import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { failed, id, value } from '@taskelith/testing';
import { fileRecordListing, fileSupervision, supervisionHost, type ExecutionSupervision, type LaunchProgram, type WorkerSettings } from '@taskelith/worker';
import { encodeEvent, encodeRecord, RECORD_FILES, type Platform } from '@taskelith/worker-supervisor';
import { BOOT } from './launch-fakes.ts';

const EXECUTION = id('ExecutionId', 'execution-1');
const PLAN = { attemptId: 'attempt-1', ownershipGeneration: 2, launchAuthId: 'grant-1', deadline: { bootId: BOOT, milliseconds: 26_000 } };
const PROGRAM: LaunchProgram = {
  command: { executable: '/bin/true', arguments: ['--quiet'] }, supervisorVersion: '1.2.3', executionAccount: { uid: 2000, gid: 2001 },
};

let executions: string;
let namespace: Result<string> | undefined;

function platform(name: 'linux' | 'darwin'): Platform {
  return {
    name,
    clock: { read: () => ok({ bootId: BOOT, milliseconds: 1_000 }) },
    inspector: { bootId: () => ok(BOOT), identity: () => ok(undefined), listing: () => ok([]) },
    containment: () => undefined,
    namespaceIncarnation: () => namespace,
  };
}

function supervision(name: 'linux' | 'darwin' = 'darwin'): ExecutionSupervision {
  return fileSupervision({ executions, platform: platform(name), program: PROGRAM })(EXECUTION);
}

function recordFile(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(executions, EXECUTION, file), 'utf8')) as Record<string, unknown>;
}

beforeEach(() => {
  executions = join(realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-supervision-'))), 'executions');
  mkdirSync(executions, { mode: 0o700 });
  namespace = undefined;
});

afterEach(() => rmSync(join(executions, '..'), { recursive: true, force: true }));

test('prepare writes intent with the plan, the program, and on Linux the namespace incarnation', async () => {
  namespace = ok('pid:[4026531836]');
  value(await supervision('linux').prepare(PLAN));
  assert.deepEqual(recordFile(RECORD_FILES.intent), {
    format: 1, executionId: EXECUTION, ...PLAN, supervisorVersion: '1.2.3', command: PROGRAM.command,
    namespaceIncarnation: 'pid:[4026531836]', executionAccount: { uid: 2000, gid: 2001 },
  });
});

test('prepare fails when the namespace incarnation cannot be read', async () => {
  namespace = err(failure('unavailable', 'no /proc'));
  assert.equal((await supervision('linux').prepare(PLAN)).ok, false);
});

test('without a launch program a record is sealed and removed but never prepared', async () => {
  const recovering = fileSupervision({ executions, platform: platform('darwin') })(EXECUTION);
  assert.equal(failed(await recovering.prepare(PLAN)).code, 'precondition-failed');
  assert.equal(existsSync(join(executions, EXECUTION)), false);
  assert.deepEqual(value(await recovering.seal()), { kind: 'seal', by: 'worker', reason: 'recovery' });
  value(await recovering.remove());
  assert.equal(existsSync(join(executions, EXECUTION)), false);
});

test('seal creates the directory and returns the winning launch record', async () => {
  assert.deepEqual(value(await supervision().seal()), { kind: 'seal', by: 'worker', reason: 'recovery' });
  assert.deepEqual(value(await supervision().seal()), { kind: 'seal', by: 'worker', reason: 'recovery' });
});

test('read reports the launch record, the spawned process, and the exit', async () => {
  value(await supervision().prepare(PLAN));
  const directory = join(executions, EXECUTION);
  writeFileSync(join(directory, RECORD_FILES.launch), encodeRecord({ kind: 'claim', launchAuthId: 'grant-1', supervisor: 1 }));
  writeFileSync(join(directory, RECORD_FILES.handle), encodeRecord({
    kind: 'spawned', process: { bootId: BOOT, pid: 42, startTime: 7 }, processGroupId: 42,
  }));
  writeFileSync(join(directory, RECORD_FILES.exit), encodeRecord({
    status: { kind: 'code', code: 0 }, startProven: true, termination: 'process-group-empty',
  }));
  const facts = value(await supervision().read());
  assert.deepEqual(facts, {
    problems: [],
    cancellationNotApplied: false,
    launch: { kind: 'claim', launchAuthId: 'grant-1', supervisor: 1 },
    process: { platform: 'darwin', bootId: BOOT, pid: 42, startTime: 7, processGroupId: 42 },
    exit: { status: { kind: 'code', code: 0 }, startProven: true, termination: 'process-group-empty' },
  });
});

test('a corrupt launch record is a problem, never a fact', async () => {
  value(await supervision().prepare(PLAN));
  writeFileSync(join(executions, EXECUTION, RECORD_FILES.launch), '{not json');
  const facts = value(await supervision().read());
  assert.equal(facts.launch, undefined);
  assert.deepEqual(facts.problems.map(({ file }) => file), [RECORD_FILES.launch]);
});

test('cancel writes the cancel file once', async () => {
  value(await supervision().prepare(PLAN));
  value(await supervision().cancel('cancellation cancel-1'));
  value(await supervision().cancel('cancellation cancel-2'));
  assert.deepEqual(recordFile(RECORD_FILES.cancel), { format: 1, reason: 'cancellation cancel-1' });
});

test('recovery of a record without a launch record seals it and reports not-started', async () => {
  value(await supervision().prepare(PLAN));
  assert.deepEqual(value(await supervision().recover('first')), { fact: 'not-started' });
  assert.deepEqual(recordFile(RECORD_FILES.launch), { format: 1, kind: 'seal', by: 'worker', reason: 'recovery' });
});

test('recovery reports a recorded exit, and a missing record is uncertain', async () => {
  value(await supervision().prepare(PLAN));
  const directory = join(executions, EXECUTION);
  writeFileSync(join(directory, RECORD_FILES.launch), encodeRecord({ kind: 'claim', launchAuthId: 'grant-1', supervisor: 1 }));
  writeFileSync(join(directory, RECORD_FILES.exit), encodeRecord({
    status: { kind: 'unknown' }, startProven: false, spawnFailure: 'ENOENT', termination: 'never-spawned',
  }));
  assert.equal(value(await supervision().recover('first')).fact, 'exited');
  rmSync(directory, { recursive: true });
  assert.deepEqual(value(await supervision().recover('first')), { fact: 'uncertain', reason: 'the journaled record is missing or damaged' });
});

test('read reports the first survivors with their groups, leaves out an older entry without one, and a cancel not applied', async () => {
  value(await supervision().prepare(PLAN));
  const directory = join(executions, EXECUTION);
  writeFileSync(join(directory, RECORD_FILES.handle), encodeRecord({
    kind: 'spawned', process: { bootId: BOOT, pid: 42, startTime: 7 }, processGroupId: 42,
  }));
  const survivors = [{ bootId: BOOT, pid: 43, startTime: 8, processGroupId: 50 }, { bootId: BOOT, pid: 44, startTime: 9 }];
  writeFileSync(join(directory, RECORD_FILES.events), [
    encodeEvent({ kind: 'survivors', processes: survivors }),
    encodeEvent({ kind: 'survivors', processes: [] }),
    encodeEvent({ kind: 'cancellation', step: 'not-applied' }),
  ].join(''));
  const facts = value(await supervision().read());
  assert.deepEqual(facts.survivors, [
    { platform: 'darwin', bootId: BOOT, pid: 43, startTime: 8, processGroupId: 50 },
  ]);
  assert.equal(facts.cancellationNotApplied, true);
});

test('a damaged event log is a problem of the read', async () => {
  value(await supervision().prepare(PLAN));
  writeFileSync(join(executions, EXECUTION, RECORD_FILES.events), '9:00000000:{}\n');
  assert.deepEqual(value(await supervision().read()).problems.map(({ file }) => file), [RECORD_FILES.events]);
});

test('remove deletes a record and counts a missing one as removed', async () => {
  value(await supervision().seal());
  value(await supervision().remove());
  assert.equal(existsSync(join(executions, EXECUTION)), false);
  value(await supervision().remove());
});

test('the record listing names directories only, and a missing directory lists nothing', async () => {
  value(await supervision().seal());
  writeFileSync(join(executions, 'stray-file'), '');
  assert.deepEqual(value(await fileRecordListing(executions)()), [EXECUTION]);
  assert.deepEqual(value(await fileRecordListing(join(executions, 'absent'))()), []);
  assert.equal((await fileRecordListing(join(executions, 'stray-file'))()).ok, false);
});

test('a record without a survivors event reports no survivors fact', async () => {
  value(await supervision().prepare(PLAN));
  assert.equal(value(await supervision().read()).survivors, undefined);
});

const UNLISTABLE_SURVIVORS = [
  { name: 'no listable process', processes: [] },
  { name: 'only entries an older supervisor wrote without groups', processes: [{ bootId: BOOT, pid: 44, startTime: 9 }] },
];

for (const { name, processes } of UNLISTABLE_SURVIVORS) {
  test(`a survivors event with ${name} still reports an empty survivors fact`, async () => {
    value(await supervision().prepare(PLAN));
    writeFileSync(join(executions, EXECUTION, RECORD_FILES.events), encodeEvent({ kind: 'survivors', processes }));
    assert.deepEqual(value(await supervision().read()).survivors, []);
  });
}

const LINUX_ONLY = process.platform === 'linux' ? {} : { skip: 'supervisionHost composes the Linux platform only on Linux' };

function hostSettings(overrides: Partial<WorkerSettings>): WorkerSettings {
  return {
    dataRoot: join(executions, '..'), controlPlaneUrl: new URL('http://127.0.0.1:1/'), natsUrl: new URL('nats://127.0.0.1:2'),
    host: { platform: 'linux', architecture: 'x64', hostname: 'host-1' },
    capacity: { slots: 1, cpuMillicores: 1_000, memoryMebibytes: 1_024, controls: [] }, ...overrides,
  };
}

test('the supervision host of a Linux launch prepares the program as the execution account', LINUX_ONLY, async () => {
  const launch = { command: PROGRAM.command, executionAccount: { uid: 2000, gid: 2001 } };
  const host = value(supervisionHost(hostSettings({ containmentParent: '/sys/fs/cgroup/absent-parent', launch }), executions, '4.5.6'));
  value(await host.supervision(EXECUTION).prepare(PLAN));
  assert.equal(recordFile(RECORD_FILES.intent).supervisorVersion, '4.5.6');
  assert.deepEqual(recordFile(RECORD_FILES.intent).executionAccount, { uid: 2000, gid: 2001 });
  assert.deepEqual(value(await host.records!()), [EXECUTION]);
  assert.deepEqual(value(host.containments!()), [], 'an absent parent holds no containment');
});

test('the supervision host without a launch prepares nothing', LINUX_ONLY, async () => {
  const host = value(supervisionHost(hostSettings({ containmentParent: '/sys/fs/cgroup/absent-parent' }), executions, '4.5.6'));
  assert.equal(failed(await host.supervision(EXECUTION).prepare(PLAN)).code, 'precondition-failed');
});

test('the supervision host of a launch without an account prepares none', LINUX_ONLY, async () => {
  const accountless = value(supervisionHost(hostSettings({ containmentParent: '/sys/fs/cgroup/absent-parent', launch: { command: PROGRAM.command } }), executions, '4.5.6'));
  value(await accountless.supervision(EXECUTION).prepare(PLAN));
  assert.equal(recordFile(RECORD_FILES.intent).executionAccount, undefined);
});

test('the supervision host on Linux needs a containment parent', LINUX_ONLY, () => {
  assert.equal(failed(supervisionHost(hostSettings({}), executions, '4.5.6')).code, 'invalid');
});
