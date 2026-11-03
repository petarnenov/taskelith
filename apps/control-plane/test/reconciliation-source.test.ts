import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANSWERED_ELSEWHERE,
  RECONCILIATION_PAGE_SIZE,
  ReconciliationSource,
  type OpenReconciliation,
  type ReconciliationResolution,
} from '@taskelith/control-plane';
import { ALREADY_ANSWERED, ITEM_CLOSED, type AnswerRequest, type NeedsYouAnswer, type NeedsYouItem, type NeedsYouScope } from '@taskelith/execution';
import { err, failure, ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { AS_OF, BoardWorld, EARLY, LATE, execution, task } from './board-fixtures.ts';

const ALPHA: NeedsYouScope = { kind: 'project', projectId: 'alpha' as never };
const INSTALLATION: NeedsYouScope = { kind: 'installation' };
const UNCERTAIN = [{ kind: 'cancellation-not-applied', observedAt: EARLY }, { kind: 'uncertain', observedAt: LATE }];

// Records each resolution and answers the item resolved, as the resolver
// of an answer's transaction does.
class RecordingResolver {
  readonly resolved: [OpenReconciliation, ReconciliationResolution][] = [];

  async resolve(item: OpenReconciliation, resolution: ReconciliationResolution) {
    this.resolved.push([item, resolution]);
    const { state: _state, ...fields } = item;
    return ok({ ...fields, state: 'resolved', resolution: { ...resolution, resolvedAt: LATE } } as NeedsYouItem);
  }
}

async function world(): Promise<BoardWorld> {
  const board = new BoardWorld();
  await board.card('run-1');
  await board.card('run-2', 'beta');
  await board.addTask('run-1', task('task-1', [{ id: 'att-1', executions: [execution('ex-1', 'w-1', { evidence: UNCERTAIN })] }]), 'apply');
  await board.addTask('run-1', task('task-child', [{ id: 'att-2', executions: [execution('ex-2', 'w-1', { evidence: [UNCERTAIN[1]] })] }], 3), 'apply', {
    parent: 'task-1', depth: 1,
  });
  await board.addTask('run-1', task('task-known', [{ id: 'att-3', executions: [execution('ex-3', 'w-1')] }]), 'apply');
  await board.addTask('run-2', task('task-beta', [{ id: 'att-4', executions: [execution('ex-4', 'w-2', { evidence: UNCERTAIN })] }]), 'apply');
  board.processes = [process('obs-1'), process('obs-2', 'w-2')];
  return board;
}

function process(observationId: string, workerId = 'w-1') {
  return { workerId, journalId: `journal-${workerId}`, observationId, containment: 'cgroup x', processCount: 2, recordedAt: EARLY } as never;
}

function source(board: BoardWorld, resolver = new RecordingResolver()) {
  return new ReconciliationSource({
    reads: board.reads(), positions: { current: async () => ok('7') }, redactor: { redact: (text) => text.replaceAll('secret', '[redacted]') }, resolver,
  });
}

function request(scope: NeedsYouScope, itemId: string, answer: NeedsYouAnswer): AnswerRequest {
  return { scope, itemId: itemId as never, responder: 'person-1' as never, answer, idempotencyKey: 'key-1' as never };
}

const RESOLVE: NeedsYouAnswer = { kind: 'reconciliation', decision: 'resolve-execution', evidence: 'incident secret' as never, reason: 'a secret reason' };
const ACKNOWLEDGE: NeedsYouAnswer = { kind: 'reconciliation', decision: 'acknowledge-process', evidence: 'incident-7' as never, reason: 'handled' };

test('a project lists one item per unknown execution of its cards\' tasks, a delegated child\'s under its card', async () => {
  const listed = value(await source(await world()).openItems(ALPHA));
  assert.equal(listed.position, '7');
  const subjects = listed.items.map((item) => item.subject);
  assert.deepEqual(subjects.map((subject) => subject.scope === 'card' && [subject.runId, subject.taskId, subject.executionId]).sort(), [
    ['run-1', 'task-1', 'ex-1'], ['run-1', 'task-child', 'ex-2'],
  ]);
  const first = listed.items.find((item) => item.subject.scope === 'card' && item.subject.executionId === 'ex-1')!;
  assert.deepEqual({ ...first, id: 'id' }, {
    id: 'id', sourceId: 'reconciliation', kind: 'reconciliation', reconciliationReason: 'unknown-execution', observed: UNCERTAIN,
    subject: { scope: 'card', projectId: 'alpha', runId: 'run-1', taskId: 'task-1', attemptId: 'att-1', attemptGeneration: 1, executionId: 'ex-1' },
    title: 'An execution of a task has an unknown outcome', createdAt: LATE, answerableBy: 'project-maintainer', state: 'open',
  });
  assert.match(first.id, /^r[0-9a-f]{32}$/);
  const child = listed.items.find((item) => item.subject.scope === 'card' && item.subject.executionId === 'ex-2')!;
  assert.equal(child.subject.scope === 'card' && child.subject.attemptGeneration, 3);
  assert.deepEqual(listed.items.map((item) => item.id), [...listed.items.map((item) => item.id)].sort(), 'in identifier order');
});

test('the installation lists each unrecorded process that no answer acknowledged, and pages by identifier', async () => {
  const board = await world();
  const [first, second] = value(await source(board).openItems(INSTALLATION)).items;
  assert.deepEqual([first, second].map((item) => item!.subject).sort((left, right) => JSON.stringify(left) < JSON.stringify(right) ? -1 : 1), [
    { scope: 'installation', workerId: 'w-1', journalId: 'journal-w-1', observationId: 'obs-1' },
    { scope: 'installation', workerId: 'w-2', journalId: 'journal-w-2', observationId: 'obs-2' },
  ]);
  assert.deepEqual([first!.answerableBy, first!.createdAt, first!.kind === 'reconciliation' && first!.reconciliationReason], [
    'installation-owner', EARLY, 'unrecorded-process',
  ]);
  assert.deepEqual(value(await source(board).openItems(INSTALLATION, first!.id)).items, [second]);
  board.answered.set(first!.id, { ...first!, state: 'resolved' } as never);
  assert.deepEqual(value(await source(board).openItems(INSTALLATION)).items, [second]);
  board.answered.clear();
  board.processes = Array.from({ length: RECONCILIATION_PAGE_SIZE + 1 }, (_, index) => process(`obs-${index}`));
  const page = value(await source(board).openItems(INSTALLATION)).items;
  assert.equal(page.length, RECONCILIATION_PAGE_SIZE);
  assert.equal(value(await source(board).openItems(INSTALLATION, page.at(-1)!.id)).items.length, 1);
});

test('item reads an open item of its scope from the queue and a resolved one from its answers', async () => {
  const board = await world();
  const [open] = value(await source(board).openItems(INSTALLATION)).items;
  assert.deepEqual(value(await source(board).item(INSTALLATION, open!.id)), open);
  assert.equal(value(await source(board).item(ALPHA, open!.id)), undefined, 'an installation item is in no project');
  const [execution] = value(await source(board).openItems(ALPHA)).items;
  assert.equal(value(await source(board).item({ kind: 'project', projectId: 'beta' as never }, execution!.id)), undefined);
  const resolved = { ...execution!, state: 'resolved' } as never;
  board.answered.set(execution!.id, resolved);
  assert.equal(value(await source(board).item(ALPHA, execution!.id)), resolved);
  assert.equal(value(await source(board).item(INSTALLATION, execution!.id)), undefined);
  assert.equal(value(await source(board).item(ALPHA, 'r-unknown' as never)), undefined);
});

test('an answer reaches the resolver redacted, with the decision of the item\'s reason', async () => {
  const board = await world();
  const resolver = new RecordingResolver();
  const [execution] = value(await source(board).openItems(ALPHA)).items;
  const resolved = value(await source(board, resolver).answer(request(ALPHA, execution!.id, RESOLVE)));
  assert.equal(resolved.state, 'resolved');
  assert.deepEqual(resolver.resolved.map(([item, resolution]) => [item.id, resolution]), [[execution!.id, {
    resolvedBy: 'person-1', answer: { kind: 'reconciliation', decision: 'resolve-execution', evidence: 'incident [redacted]', reason: 'a [redacted] reason' },
  }]]);
  const [process] = value(await source(board).openItems(INSTALLATION)).items;
  value(await source(board, resolver).answer(request(INSTALLATION, process!.id, ACKNOWLEDGE)));
  assert.equal(resolver.resolved.length, 2);
});

test('a mismatched decision or kind is invalid, a resolved item already-answered, and an unknown one not-found', async () => {
  const board = await world();
  const [execution] = value(await source(board).openItems(ALPHA)).items;
  const [process] = value(await source(board).openItems(INSTALLATION)).items;
  assert.equal(failed(await source(board).answer(request(ALPHA, execution!.id, ACKNOWLEDGE))).code, 'invalid');
  assert.equal(failed(await source(board).answer(request(INSTALLATION, process!.id, RESOLVE))).code, 'invalid');
  assert.equal(failed(await source(board).answer(request(ALPHA, execution!.id, { kind: 'escalation', decision: 'retry' }))).code, 'invalid');
  assert.equal(failed(await source(board).answer(request(ALPHA, 'r-unknown', RESOLVE))).code, 'not-found');
  assert.equal(failed(await source(board).answer(request(INSTALLATION, execution!.id, RESOLVE))).code, 'not-found');
  board.answered.set(execution!.id, { ...execution!, state: 'resolved' } as never);
  const again = failed(await source(board).answer(request(ALPHA, execution!.id, RESOLVE)));
  assert.deepEqual([again.code, again.details.reason], ['conflict', ALREADY_ANSWERED]);
});

test('an execution whose terminal fact arrived first closes its item, which leaves the listing and refuses an answer', async () => {
  const board = await world();
  const [open] = value(await source(board).openItems(ALPHA)).items.filter((each) => each.subject.scope === 'card' && each.subject.executionId === 'ex-1');
  const exited = execution('ex-1', 'w-1', { state: 'exited', evidence: UNCERTAIN, exit: { recordedAt: AS_OF } });
  board.tasks.set('task-1', task('task-1', [{ id: 'att-1', executions: [exited] }]));
  const closed = value(await source(board).item(ALPHA, open!.id));
  assert.deepEqual([closed?.state, closed?.state === 'closed' && closed.closedAt], ['closed', AS_OF]);
  assert.deepEqual(value(await source(board).openItems(ALPHA)).items.map((each) => each.id).includes(open!.id), false);
  const refused = failed(await source(board).answer(request(ALPHA, open!.id, RESOLVE)));
  assert.deepEqual([refused.code, refused.details.reason], ['precondition-failed', ITEM_CLOSED]);
  board.tasks.set('task-1', task('task-1', [{ id: 'att-1', executions: [{ ...exited, exit: undefined, state: 'not-started' }] }]));
  assert.equal(value(await source(board).item(ALPHA, open!.id))?.state === 'closed' && 'closed', 'closed', 'a not-started execution closes it too');
});

test('a view\'s source answers nothing, and a store that fails fails the listing', async () => {
  const board = await world();
  const [process] = value(await source(board).openItems(INSTALLATION)).items;
  assert.equal(failed(await source(board, ANSWERED_ELSEWHERE as never).answer(request(INSTALLATION, process!.id, ACKNOWLEDGE))).code, 'internal');
  const reads = board.reads();
  const broken = new ReconciliationSource({
    reads: { ...reads, reconciliation: { ...reads.reconciliation, answers: { get: async () => err(failure('unavailable', 'down')) } } },
    positions: { current: async () => ok('7') }, redactor: { redact: (text) => text }, resolver: ANSWERED_ELSEWHERE,
  });
  assert.equal(failed(await broken.openItems(INSTALLATION)).code, 'unavailable');
  assert.equal(failed(await broken.item(ALPHA, process!.id)).code, 'unavailable');
  const unpositioned = new ReconciliationSource({
    reads, positions: { current: async () => err(failure('unavailable', 'no head')) }, redactor: { redact: (text) => text }, resolver: ANSWERED_ELSEWHERE,
  });
  assert.equal(failed(await unpositioned.openItems(ALPHA)).code, 'unavailable');
  board.tasks.delete('task-1');
  assert.equal(failed(await source(board).openItems(ALPHA)).code, 'not-found');
});
