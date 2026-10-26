import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { ExecutionProcess, JournalId, WorkerJournal } from '@taskelith/execution';
import { enrollWorkerRoot, observationIdOf, type WorkerRoot } from '@taskelith/worker-journal';
import { value } from '@taskelith/testing';
import { ENROLLMENT, T0, rootOptions, temporaryDataRoot } from './fixtures.ts';

const CONTAINMENT = '/sys/fs/cgroup/taskelith/execution-9';
const MEMBER: ExecutionProcess = { platform: 'linux', bootId: 'boot-1', pid: 77, startTime: 5, processGroupId: 77 };

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;

beforeEach(() => {
  const temporary = temporaryDataRoot();
  remove = temporary.remove;
  root = value(enrollWorkerRoot(rootOptions(temporary.dataRoot), ENROLLMENT));
  journal = root.journal;
});

afterEach(() => {
  root.close();
  remove();
});

function unrecorded() {
  return value(journal.dueForPublication(T0)).filter(({ fact }) => fact.kind === 'unrecorded-process');
}

test('an unrecorded process is journaled with its containment and members', () => {
  value(journal.recordUnrecordedProcess(CONTAINMENT, [MEMBER]));
  const [entry, ...rest] = unrecorded();
  assert.deepEqual(rest, []);
  assert.deepEqual(entry?.fact, { kind: 'unrecorded-process', containment: CONTAINMENT, recoveryEpoch: journal.binding.recoveryEpoch, processes: [MEMBER] });
});

test('its identity comes from the journal and the containment alone', () => {
  value(journal.recordUnrecordedProcess(CONTAINMENT, [MEMBER]));
  const [entry] = unrecorded();
  const moved = { kind: 'unrecorded-process' as const, containment: CONTAINMENT, recoveryEpoch: journal.binding.recoveryEpoch, processes: [] };
  assert.equal(entry?.position.observationId, observationIdOf(moved, journal.binding.journalId));
  const otherJournal = 'f'.repeat(32) as JournalId;
  assert.notEqual(observationIdOf(moved, otherJournal), entry?.position.observationId);
});

test('the same containment is not journaled again while its entry waits', () => {
  value(journal.recordUnrecordedProcess(CONTAINMENT, [MEMBER]));
  value(journal.recordUnrecordedProcess(CONTAINMENT, []));
  value(journal.recordUnrecordedProcess(`${CONTAINMENT}-other`, [MEMBER]));
  assert.deepEqual(unrecorded().map(({ fact }) => fact.kind === 'unrecorded-process' && fact.containment),
    [CONTAINMENT, `${CONTAINMENT}-other`]);
});

test('a confirmed entry is pruned, so a later derivation keeps its identity', () => {
  value(journal.recordUnrecordedProcess(CONTAINMENT, [MEMBER]));
  const [first] = unrecorded();
  value(journal.confirmThrough(first!.position.sequence));
  value(journal.recordUnrecordedProcess(CONTAINMENT, [MEMBER]));
  const [again] = unrecorded();
  assert.equal(again?.position.observationId, first?.position.observationId);
  assert.ok(again!.position.sequence > first!.position.sequence);
});
