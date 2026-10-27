import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideRecovery,
  proveDarwinTermination,
  type ExitRecord,
  type NativeEvidence,
  type RecordSnapshot,
  type RecoveryEvidence,
} from '@taskelith/worker-supervisor';
import { identity, intent } from './fakes.ts';

const LINUX: NativeEvidence = { platform: 'linux', bootChanged: false, namespaceCurrent: true, oldNamespaceEndProven: false, containment: 'populated' };
const DARWIN: NativeEvidence = { platform: 'darwin', bootChanged: false, childAlive: true };
const CLAIM = { kind: 'claim', launchAuthId: 'launch-1', supervisor: 1 } as const;
const SPAWNED = { kind: 'spawned', process: identity(500), processGroupId: 500 } as const;
const EXIT: ExitRecord = { status: { kind: 'code', code: 0 }, startProven: true, termination: 'containment-empty' };

function evidence(record: Partial<RecordSnapshot> | 'missing', overrides: Partial<RecoveryEvidence> = {}): RecoveryEvidence {
  return {
    journaled: 'record',
    record: record === 'missing' ? 'missing' : { problems: [], intent: intent(), ...record },
    supervisor: 'none',
    native: LINUX,
    ...overrides,
  };
}

test('a crash before the record is journaled completes and seals', () => {
  assert.deepEqual(decideRecovery(evidence('missing', { journaled: 'intent' })), { action: 'complete-and-seal' });
});

test('a journaled record that is missing, damaged, or impossible is uncertain', () => {
  assert.equal(decideRecovery(evidence('missing')).action, 'uncertain');
  assert.equal(decideRecovery(evidence({ intent: undefined })).action, 'uncertain');
  assert.equal(decideRecovery(evidence({ problems: [{ file: 'launch', kind: 'newer-format', detail: 'has format 2' }] })).action, 'uncertain');
  assert.deepEqual(decideRecovery(evidence({ handle: SPAWNED })), { action: 'uncertain', reason: 'a handle or exit exists without a claim' });
  assert.equal(decideRecovery(evidence({ launch: { kind: 'seal', by: 'worker', reason: 'recovery' }, exit: EXIT })).action, 'uncertain');
});

test('no launch record is sealed, and a seal is reported as not started', () => {
  assert.deepEqual(decideRecovery(evidence({})), { action: 'seal' });
  assert.deepEqual(decideRecovery(evidence({ launch: { kind: 'seal', by: 'supervisor', reason: 'deadline-passed' } })), { action: 'report-not-started' });
});

test('a claim with a live supervisor is adopted, and a recorded exit is reported', () => {
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM, handle: SPAWNED }, { supervisor: 'live' })), { action: 'adopt-supervisor' });
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM, handle: SPAWNED, exit: EXIT })), { action: 'report-exit', exit: EXIT });
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM, handle: { kind: 'spawn-failed', failure: 'ENOENT' } })), {
    action: 'complete-spawn-failure',
    failure: 'ENOENT',
  });
});

test('a lock held by a dead supervisor is retried for a bounded time, then uncertain', () => {
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM }, { supervisor: 'lock-held-by-dead' })), { action: 'retry-liveness' });
  assert.equal(decideRecovery(evidence({ launch: CLAIM }, { supervisor: 'lock-held-by-dead-after-retries' })).action, 'uncertain');
});

test('Linux decides from the boot, the namespace, and the containment', () => {
  const claim = { launch: CLAIM, handle: SPAWNED };
  assert.deepEqual(decideRecovery(evidence(claim)), { action: 'adopt-containment' });
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM }, { native: { ...LINUX, containment: 'empty' } })), {
    action: 'write-unknown-exit',
    startProven: false,
    termination: 'containment-empty',
  });
  assert.equal(decideRecovery(evidence(claim, { native: { ...LINUX, containment: 'unreadable' } })).action, 'uncertain');
  assert.deepEqual(decideRecovery(evidence(claim, { native: { ...LINUX, bootChanged: true } })), {
    action: 'write-unknown-exit',
    startProven: true,
    termination: 'boot-changed',
  });
  assert.equal(decideRecovery(evidence(claim, { native: { ...LINUX, namespaceCurrent: false } })).action, 'uncertain');
  assert.deepEqual(decideRecovery(evidence(claim, { native: { ...LINUX, namespaceCurrent: false, oldNamespaceEndProven: true } })), {
    action: 'write-unknown-exit',
    startProven: true,
    termination: 'namespace-ended',
  });
});

test('macOS adopts a live child, and is uncertain without a handle or after the child is gone', () => {
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM, handle: SPAWNED }, { native: DARWIN })), { action: 'adopt-child' });
  assert.equal(decideRecovery(evidence({ launch: CLAIM, handle: SPAWNED }, { native: { ...DARWIN, childAlive: false } })).action, 'uncertain');
  assert.equal(decideRecovery(evidence({ launch: CLAIM }, { native: DARWIN })).action, 'uncertain');
  assert.deepEqual(decideRecovery(evidence({ launch: CLAIM }, { native: { ...DARWIN, bootChanged: true } })), {
    action: 'write-unknown-exit',
    startProven: false,
    termination: 'boot-changed',
  });
});

test('macOS proves an empty set only from one listing without the group or a recorded descendant', () => {
  const unrelated = { identity: identity(900), parentPid: 1, processGroupId: 900 };
  const sameGroup = { identity: identity(777), parentPid: 1, processGroupId: 500 };
  const escaped = { identity: identity(888), parentPid: 1, processGroupId: 888 };

  assert.deepEqual(proveDarwinTermination({ processGroupId: 500, listing: [unrelated], recordedDescendants: [] }), { proven: true });
  assert.deepEqual(proveDarwinTermination({ processGroupId: 500, listing: undefined, recordedDescendants: [] }), { proven: false, survivors: [] });
  assert.deepEqual(proveDarwinTermination({ processGroupId: 500, listing: [sameGroup], recordedDescendants: [] }), {
    proven: false,
    survivors: [{ ...identity(777), processGroupId: 500 }],
  });
  assert.deepEqual(proveDarwinTermination({ processGroupId: 500, listing: [escaped], recordedDescendants: [identity(888)] }), {
    proven: false,
    survivors: [{ ...identity(888), processGroupId: 888 }],
  });
  const reused = { identity: identity(888, 1), parentPid: 1, processGroupId: 888 };
  assert.deepEqual(proveDarwinTermination({ processGroupId: 500, listing: [reused], recordedDescendants: [identity(888)] }), { proven: true });
});
