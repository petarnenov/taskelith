import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleSnapshot,
  classifyOmission,
  highestAppliedSequence,
  isRolledBack,
  parseSequence,
  recordAppliedSequence,
  startProducerCursor,
  type AssignmentId,
  type InventoryPart,
  type InventorySnapshot,
  type JournalId,
  type WorkerId,
} from '@taskelith/execution';
import { value } from '@taskelith/testing';

const WORKER = 'worker-1' as WorkerId;
const JOURNAL = 'journal-1' as JournalId;
const EARLIER = 'journal-0' as JournalId;
const sequence = (number: number) => value(parseSequence(number));

function part(number: number, assignmentIds: string[], parts = 2): InventoryPart {
  return {
    reportId: 'report-1', part: number, parts, workerId: WORKER, journalId: JOURNAL, requestId: 'request-1', snapshot: 3, throughSequence: 6,
    assignments: assignmentIds.map((assignmentId) => ({ commandId: `c-${assignmentId}`, assignmentId, attemptId: 'a', ownershipGeneration: 2, state: 'accepted' })),
    executions: [],
  };
}

function snapshot(throughSequence: number, assignmentIds: string[] = []): InventorySnapshot {
  return { reportId: 'report-1', workerId: WORKER, journalId: JOURNAL, snapshot: 3, throughSequence, assignmentIds: new Set(assignmentIds) };
}

test('a snapshot is assembled only once every part is present', () => {
  assert.equal(assembleSnapshot([]), undefined);
  assert.equal(assembleSnapshot([part(2, ['assignment-2'])]), undefined);
  const assembled = assembleSnapshot([part(2, ['assignment-2']), part(1, ['assignment-1'])]);
  assert.deepEqual(assembled, {
    reportId: 'report-1', workerId: WORKER, journalId: JOURNAL, requestId: 'request-1', snapshot: 3, throughSequence: 6,
    assignmentIds: new Set(['assignment-2', 'assignment-1']),
  });
  const { requestId: _none, ...unsolicited } = part(1, [], 1);
  assert.equal(assembleSnapshot([unsolicited])?.requestId, undefined);
});

test('the highest applied sequence counts the sequences above a gap', () => {
  const cursor = startProducerCursor(WORKER, JOURNAL);
  assert.equal(highestAppliedSequence(cursor), 0);
  const gapped = [1, 2, 7].reduce((next, number) => value(recordAppliedSequence(next, sequence(number))), cursor);
  assert.equal(highestAppliedSequence(gapped), 7);
});

test('a fresh snapshot below its bound, or omitting what the bound lists, is a rollback', () => {
  const bound = { journalId: JOURNAL, sequence: 9, assignmentIds: ['assignment-1' as AssignmentId] };
  assert.equal(isRolledBack(snapshot(6, ['assignment-1']), bound), true);
  assert.equal(isRolledBack(snapshot(9, []), bound), true);
  assert.equal(isRolledBack(snapshot(9, ['assignment-1']), bound), false);
  assert.equal(isRolledBack(snapshot(0), undefined), false);
});

test('an omission proves lost history only for an acceptance at or below the snapshot, or from an earlier journal', () => {
  assert.equal(classifyOmission(snapshot(6), undefined), 'unclassified');
  assert.equal(classifyOmission(snapshot(6), { journalId: JOURNAL, sequence: sequence(6) }), 'lost-local-history');
  assert.equal(classifyOmission(snapshot(6), { journalId: JOURNAL, sequence: sequence(7) }), 'unclassified');
  assert.equal(classifyOmission(snapshot(6), { journalId: EARLIER, sequence: sequence(70) }), 'lost-local-history');
});
