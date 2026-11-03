import assert from 'node:assert/strict';
import test from 'node:test';
import { TransactionalReconciliationResolver, type ReconciliationTransaction } from '@taskelith/control-plane';
import { ITEM_CLOSED, type NeedsYouItem, type UiEvent } from '@taskelith/execution';
import { err, failure, ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const AT = '2026-11-03T10:00:00.000Z';
const ANSWER = { kind: 'reconciliation', decision: 'resolve-execution', evidence: 'incident-7', reason: 'gone' } as const;
const RESOLUTION = { resolvedBy: 'person-1', answer: ANSWER } as never;

const PROCESS = {
  id: 'r-process', sourceId: 'reconciliation', kind: 'reconciliation', reconciliationReason: 'unrecorded-process', containment: 'cgroup x',
  processCount: 1, subject: { scope: 'installation', workerId: 'w-1', journalId: 'j-1', observationId: 'o-1' }, title: 'A process',
  createdAt: AT, answerableBy: 'installation-owner', state: 'open',
} as unknown as NeedsYouItem;

function execution(subject: object): NeedsYouItem {
  return {
    ...PROCESS, id: 'r-execution', reconciliationReason: 'unknown-execution', answerableBy: 'project-maintainer',
    subject: { scope: 'card', projectId: 'alpha', runId: 'run-1', ...subject },
  } as unknown as NeedsYouItem;
}

// A transaction whose stores answer as `parts` says, recording what it
// is asked to store and publish.
function transaction(parts: { task?: unknown; record?: unknown; append?: unknown } = {}) {
  const recorded: NeedsYouItem[] = [];
  const events: UiEvent[] = [];
  const tx = {
    now: async () => AT,
    tasks: { get: async () => parts.task ?? err(failure('not-found', 'no task')) },
    reconciliationAnswers: {
      record: async (item: NeedsYouItem) => {
        recorded.push(item);
        return parts.record ?? ok(undefined);
      },
    },
    uiEvents: {
      append: async (event: UiEvent) => {
        events.push(event);
        return parts.append ?? ok(undefined);
      },
    },
  } as unknown as ReconciliationTransaction;
  return { resolver: new TransactionalReconciliationResolver(tx), recorded, events };
}

test('an acknowledged process is recorded resolved and published to the installation', async () => {
  const { resolver, recorded, events } = transaction();
  const resolved = value(await resolver.resolve(PROCESS as never, RESOLUTION));
  assert.deepEqual([resolved.state, resolved.state === 'resolved' && resolved.resolution.resolvedAt], ['resolved', AT]);
  assert.deepEqual(recorded, [resolved]);
  assert.deepEqual(events.map((event) => [event.scope.kind, event.record.type]), [['installation', 'inbox-item-changed']]);
});

test('a failing record or event fails the resolution', async () => {
  const unrecorded = transaction({ record: err(failure('conflict', 'resolved')) });
  assert.equal(failed(await unrecorded.resolver.resolve(PROCESS as never, RESOLUTION)).code, 'conflict');
  assert.equal(unrecorded.events.length, 0);
  const unpublished = transaction({ append: err(failure('unavailable', 'down')) });
  assert.equal(failed(await unpublished.resolver.resolve(PROCESS as never, RESOLUTION)).code, 'unavailable');
});

test('an execution item without its task, attempt, or execution is refused before any store', async () => {
  const { resolver, recorded } = transaction();
  assert.equal(failed(await resolver.resolve(execution({ taskId: 'task-1' }) as never, RESOLUTION)).code, 'internal');
  const unreadable = failed(await resolver.resolve(execution({ taskId: 't', attemptId: 'a', executionId: 'e' }) as never, RESOLUTION));
  assert.equal(unreadable.code, 'not-found', 'the task read fails');
  const missing = transaction({ task: ok({ attempts: [], ownershipGeneration: 1 }) });
  const closed = failed(await missing.resolver.resolve(execution({ taskId: 't', attemptId: 'a', executionId: 'e' }) as never, RESOLUTION));
  assert.deepEqual([closed.code, closed.details.reason], ['precondition-failed', ITEM_CLOSED]);
  assert.deepEqual(recorded, []);
});
