import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeEvent,
  encodeRecord,
  parseCancel,
  parseEvents,
  parseExit,
  parseHandle,
  parseIntent,
  parseLaunch,
  parseSupervisor,
  RECORD_FORMAT,
} from '@taskelith/worker-supervisor';
import { identity, intent } from './fakes.ts';

test('every record carries its format version and reads back unchanged', () => {
  const record = intent({ namespaceIncarnation: 'pid:[7]@boot-1/42', executionAccount: { uid: 2000, gid: 2000 } });
  const text = encodeRecord(record);

  assert.equal(JSON.parse(text).format, RECORD_FORMAT);
  assert.deepEqual(parseIntent(text), { ok: true, value: record });
  assert.deepEqual(parseSupervisor('supervisor.2', encodeRecord({ serial: 2, process: identity(7) })), { ok: true, value: { serial: 2, process: identity(7) } });
  assert.deepEqual(parseCancel(encodeRecord({ reason: 'requested' })), { ok: true, value: { reason: 'requested' } });
});

test('a launch record is a claim or a seal, and nothing else', () => {
  assert.ok(parseLaunch(encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 1, containment: '/c/1' })).ok);
  assert.ok(parseLaunch(encodeRecord({ kind: 'seal', by: 'worker', reason: 'recovery' })).ok);
  assert.equal(parseLaunch(encodeRecord({ kind: 'claim', launchAuthId: 'launch-1', supervisor: 2 })).ok, false);
  assert.equal(parseLaunch(encodeRecord({ kind: 'seal', by: 'operator', reason: 'recovery' })).ok, false);
});

test('a handle and an exit keep the spawn and the termination evidence', () => {
  assert.ok(parseHandle(encodeRecord({ kind: 'spawned', process: identity(500), processGroupId: 500 })).ok);
  assert.ok(parseHandle(encodeRecord({ kind: 'spawn-failed', failure: 'ENOENT' })).ok);
  const exit = { status: { kind: 'signal', signal: 'SIGKILL' }, startProven: true, termination: 'containment-empty' };
  assert.deepEqual(parseExit(encodeRecord(exit)), { ok: true, value: exit });
  assert.equal(parseExit(encodeRecord({ ...exit, status: { kind: 'code', code: 300 } })).ok, false);
  assert.equal(parseExit(encodeRecord({ ...exit, termination: 'guessed' })).ok, false);
});

test('an exit proven by recovery evidence has an unknown status', () => {
  const recovered = { status: { kind: 'unknown' }, startProven: true, termination: 'boot-changed' };
  for (const termination of ['boot-changed', 'namespace-ended']) {
    assert.ok(parseExit(encodeRecord({ ...recovered, termination })).ok, termination);
    for (const status of [{ kind: 'code', code: 0 }, { kind: 'signal', signal: 'SIGKILL' }]) {
      assert.equal(parseExit(encodeRecord({ ...recovered, status, termination })).ok, false, termination);
    }
  }
});

test('a corrupt, newer-format, or unversioned file is never guessed around', () => {
  assert.deepEqual(parseIntent('{not json'), { ok: false, error: { file: 'intent', kind: 'corrupt', detail: 'is not JSON' } });
  assert.deepEqual(parseLaunch(JSON.stringify({ format: RECORD_FORMAT + 1, kind: 'seal' })), {
    ok: false,
    error: { file: 'launch', kind: 'newer-format', detail: `has format ${RECORD_FORMAT + 1}` },
  });
  assert.equal(parseHandle(JSON.stringify({ kind: 'spawn-failed', failure: 'x' })).ok, false);
  assert.equal(parseIntent(encodeRecord({ ...intent(), command: { executable: 'x', arguments: [1] } })).ok, false);
  assert.equal(parseIntent(encodeRecord({ ...intent(), ownershipGeneration: 0 })).ok, false);
});

test('the event log discards a torn last entry and rejects damage before it', () => {
  const first = encodeEvent({ kind: 'descendant', process: identity(501) });
  const second = encodeEvent({ kind: 'cancellation', step: 'terminate-sent' });
  const survivors = encodeEvent({ kind: 'survivors', processes: [identity(502)] });

  assert.deepEqual(parseEvents(first + second + survivors), {
    ok: true,
    value: [
      { kind: 'descendant', process: identity(501) },
      { kind: 'cancellation', step: 'terminate-sent' },
      { kind: 'survivors', processes: [identity(502)] },
    ],
  });
  const torn = parseEvents(first + second.slice(0, 10));
  assert.ok(torn.ok);
  assert.equal(torn.value.length, 1);
  assert.equal(parseEvents(first.replace('501', '509') + second).ok, false);
  assert.equal(parseEvents('').ok, true);
});
