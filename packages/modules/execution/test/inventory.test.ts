import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleSnapshot,
  classifyOmission,
  highestAppliedSequence,
  highestReceivedSnapshot,
  isFreshReport,
  isRolledBack,
  isUnsolicited,
  parseSequence,
  recordAppliedSequence,
  startProducerCursor,
  supersededReports,
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
  assert.equal(assembleSnapshot([]), 'incomplete');
  assert.equal(assembleSnapshot([part(2, ['assignment-2'])]), 'incomplete');
  const assembled = assembleSnapshot([part(2, ['assignment-2']), part(1, ['assignment-1'])]);
  assert.deepEqual(assembled, {
    reportId: 'report-1', workerId: WORKER, journalId: JOURNAL, requestId: 'request-1', snapshot: 3, throughSequence: 6,
    assignmentIds: new Set(['assignment-2', 'assignment-1']),
  });
  const { requestId: _none, ...unsolicited } = part(1, [], 1);
  assert.equal((assembleSnapshot([unsolicited]) as InventorySnapshot).requestId, undefined);
});

test('parts that disagree on a common field, or lie outside their count, are inconsistent', () => {
  assert.equal(assembleSnapshot([part(1, []), part(2, [], 3)]), 'inconsistent', 'a third part is missing');
  assert.equal(assembleSnapshot([part(1, []), part(3, [])]), 'inconsistent');
  assert.equal(assembleSnapshot([part(0, [], 1)]), 'inconsistent');
  const changes: Partial<InventoryPart>[] = [
    { journalId: EARLIER }, { snapshot: 4 }, { throughSequence: 7 }, { requestId: 'request-2' }, { workerId: 'worker-2' as WorkerId },
  ];
  for (const change of changes) assert.equal(assembleSnapshot([part(1, []), { ...part(2, []), ...change }]), 'inconsistent', JSON.stringify(change));
  const { requestId: _none, ...unsolicited } = part(2, []);
  assert.equal(assembleSnapshot([part(1, []), unsolicited]), 'inconsistent', 'one part without the request');
});

function report(reportId: string, snapshot: number, requestId?: string): InventoryPart {
  const { requestId: _none, ...unsolicited } = { ...part(1, [], 1), reportId, snapshot };
  return requestId === undefined ? unsolicited : { ...unsolicited, requestId };
}

test('of the reports that are not fresh only the newest survives, while not below the highest snapshot', () => {
  const pending = [report('report-a', 2), report('report-b', 3), report('report-c', 1, 'request-1'), report('report-d', 5, 'request-2')];
  assert.deepEqual(supersededReports(pending, { requestId: 'request-2', highestSnapshot: 5 }), new Set(['report-a', 'report-b', 'report-c']));
  assert.deepEqual(supersededReports(pending, { requestId: 'request-1', highestSnapshot: 5 }), new Set(['report-a', 'report-b']));
  assert.deepEqual(supersededReports(pending.slice(0, 2), { requestId: undefined, highestSnapshot: 3 }), new Set(['report-a']));
  const tied = [report('report-a', 3), report('report-b', 3)];
  assert.deepEqual(supersededReports(tied, { requestId: undefined, highestSnapshot: 3 }), new Set(['report-a']), 'the last wins a tie');
  assert.deepEqual(supersededReports(tied, { requestId: undefined, highestSnapshot: 3, preferred: 'report-a' }), new Set(['report-b']));
  assert.deepEqual(supersededReports([], { requestId: undefined, highestSnapshot: 0 }), new Set());
});

test('of the fresh reports only the newest survives, the arriving one winning a tie', () => {
  const answers = [report('report-a', 4, 'request-1'), report('report-b', 6, 'request-1'), report('report-c', 6, 'request-1')];
  assert.deepEqual(supersededReports(answers, { requestId: 'request-1', highestSnapshot: 6 }), new Set(['report-a', 'report-b']));
  assert.deepEqual(supersededReports(answers, { requestId: 'request-1', highestSnapshot: 9, preferred: 'report-b' }), new Set(['report-a', 'report-c']));
});

test('the highest received snapshot counts the pending parts', () => {
  assert.equal(highestReceivedSnapshot(3, []), 3);
  assert.equal(highestReceivedSnapshot(3, [report('report-a', 7)]), 7);
});

test('a report is fresh only when it answers the current request', () => {
  assert.equal(isFreshReport({ requestId: 'request-1' }, 'request-1'), true);
  assert.equal(isFreshReport({ requestId: 'request-1' }, 'request-2'), false);
  assert.equal(isFreshReport({}, undefined), false);
});

test('a report is unsolicited only when it answers no request', () => {
  assert.equal(isUnsolicited({}), true);
  assert.equal(isUnsolicited({ requestId: 'request-1' }), false);
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
