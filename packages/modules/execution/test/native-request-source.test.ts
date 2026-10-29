import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant } from '@taskelith/kernel';
import {
  ALREADY_ANSWERED,
  ATTEMPT_NOT_CURRENT,
  BEFORE_ANY_EVENT,
  ITEM_CLOSED,
  InMemorySessionTimelineStore,
  KEY_REUSED,
  NativeRequestSource,
  SESSION_STOPPED,
  SessionTimelineService,
  parseTurnId,
  type AnswerRequest,
  type HarnessRequestKind,
  type IdempotencyKey,
  type NeedsYouAnswer,
  type NeedsYouItemId,
  type NeedsYouSourceId,
  type ResponseCommand,
  type SessionScope,
} from '@taskelith/execution';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import { failed, sequentialIds, value } from '@taskelith/testing';
import { ownership } from './fixtures.ts';
import {
  AUTHOR,
  CHILD_TASK,
  FIRST_ATTEMPT,
  HARNESS,
  NATIVE,
  OTHER_SESSION,
  PERSON,
  SECOND_ATTEMPT,
  SESSION,
  TASK,
  allow,
  binding,
  generation,
  permissionRequest,
  requestKey,
  turnId,
  turnKey,
} from './session-fixtures.ts';

const AT = value(parseInstant('2026-10-29T09:00:00.000Z'));
const clock = { now: () => AT };
const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
const PROJECT = id('ProjectId', 'alpha') as ProjectId;
const CARD: SessionScope = { projectId: PROJECT, runId: id('RunId', 'run-alpha') as WorkflowRunId };
const OTHER_CARD: SessionScope = { projectId: id('ProjectId', 'beta') as ProjectId, runId: id('RunId', 'run-beta') as WorkflowRunId };
const OTHER_PRINCIPAL = id('PrincipalId', 'person-2');

// TASK belongs to CARD, CHILD_TASK to OTHER_CARD, and no other task has a
// lineage.
function timeline() {
  const scopes = new Map<TaskId, SessionScope>([[TASK, CARD], [CHILD_TASK, OTHER_CARD]]);
  const store = new InMemorySessionTimelineStore((taskId) => scopes.get(taskId));
  const digest = { digest: (input: string) => `digest:${input}` };
  const service = new SessionTimelineService({
    store, digest, redactor: { redact: (text: string) => text }, turnIds: sequentialIds('TurnId', 'turn'), clock,
    itemIds: sequentialIds('NeedsYouItemId', 'item'),
  });
  const source = new NativeRequestSource({
    id: id('NeedsYouSourceId', 'native-requests') as NeedsYouSourceId, store, timeline: service, digest, clock, positions: BEFORE_ANY_EVENT,
  });
  return { store, service, source };
}

type Timeline = ReturnType<typeof timeline>;

// SESSION runs `turn-1` in generation 1 with the open request `request-1`.
async function withOpenRequest({ service }: Timeline, kind: HarnessRequestKind = 'permission-request'): Promise<void> {
  value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(SESSION, binding()));
  value(await service.startGeneration(SESSION, { generation: generation(1), nativeSessionId: NATIVE }));
  value(await service.submitTurn(SESSION, { key: turnKey('key-1'), author: PERSON, text: 'first turn' }));
  value(await service.deliverTurn(SESSION, { turnId: turnId('turn-1'), generation: generation(1) }));
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-1'), kind }));
}

async function items({ store }: Timeline) {
  return value(await store.transaction(async (tx) => {
    const found = [];
    for (const kind of ['permission-request', 'input-request', 'delivery-acknowledgement'] as const) {
      const item = value(await tx.items.find(SESSION, kind, requestKey('request-1')));
      if (item !== undefined) found.push(item);
    }
    return { ok: true as const, value: found };
  }));
}

const response = (key: string, submission = allow()): ResponseCommand => ({ key: turnKey(key) as IdempotencyKey, response: submission });
const answer = (itemId: string, key: string, given: NeedsYouAnswer, responder = AUTHOR): AnswerRequest => ({
  itemId: id('NeedsYouItemId', itemId) as NeedsYouItemId, responder, answer: given, idempotencyKey: turnKey(key) as IdempotencyKey,
});

test('a TurnId is t and 32 lowercase hexadecimal digits, and a UUID or another form is refused', () => {
  assert.equal(value(parseTurnId(`t${'0a'.repeat(16)}`)), `t${'0a'.repeat(16)}`);
  for (const text of ['0b9e3a52-5f0e-4e43-9d7c-1f0c3b8f6a21', `t${'0A'.repeat(16)}`, `t${'0'.repeat(31)}`, `u${'0'.repeat(32)}`, 'turn-1']) {
    assert.equal(failed(parseTurnId(text)).code, 'invalid', text);
  }
});

test('a turn of a stopped session fails with session-stopped, and a response of another attempt with attempt-not-current', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  const notCurrent = failed(await subject.service.consumeResponse(SESSION, response('answer-1', { ...allow(), attemptId: SECOND_ATTEMPT })));
  assert.deepEqual([notCurrent.code, notCurrent.details.reason], ['precondition-failed', ATTEMPT_NOT_CURRENT]);
  value(await subject.service.recordLimitSignal(SESSION, {}));
  const stopped = failed(await subject.service.submitTurn(SESSION, { key: turnKey('key-2'), author: PERSON, text: 'too late' }));
  assert.deepEqual([stopped.code, stopped.details.reason], ['precondition-failed', SESSION_STOPPED]);
});

test('a recorded permission or input request opens one item for the bound attempt, and a delegation request none', async () => {
  for (const kind of ['permission-request', 'input-request', 'delegation-request'] as const) {
    const subject = timeline();
    await withOpenRequest(subject, kind);
    const expected = kind === 'delegation-request' ? [] : [{
      id: 'item-1', kind, sessionId: SESSION, taskId: TASK, request: requestKey('request-1'),
      attemptId: FIRST_ATTEMPT, attemptGeneration: ownership(1), createdAt: AT, state: 'open',
    }];
    assert.deepEqual(await items(subject), expected, kind);
  }
});

test('a response resolves its item with the responder and the time, and a refused response leaves it open', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  failed(await subject.service.consumeResponse(SESSION, response('answer-0', { ...allow(), attemptId: SECOND_ATTEMPT })));
  assert.equal((await items(subject))[0]!.state, 'open');
  value(await subject.service.consumeResponse(SESSION, response('answer-1')));
  const [item] = await items(subject);
  assert.deepEqual(item!.state === 'resolved' && item!.resolution, { resolvedBy: AUTHOR, resolvedAt: AT, answer: { kind: 'permission-request', decision: 'allow' } });
});

test('a standing rule\'s answer and an expiry close the item, as no person answered', async () => {
  const ruled = timeline();
  await withOpenRequest(ruled);
  value(await ruled.service.consumeResponse(SESSION, response('rule-1', { ...allow(), responder: { kind: 'standing-rule', ruleId: id('StandingRuleId', 'rule-1') } })));
  assert.deepEqual((await items(ruled)).map((item) => [item.state, item.state === 'closed' && item.closedAt]), [['closed', AT]]);
  const expired = timeline();
  await withOpenRequest(expired);
  value(await expired.service.recordTurnOutcome(SESSION, { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' }));
  assert.deepEqual((await items(expired)).map((item) => item.state), ['closed']);
});

test('a generation\'s end closes an open request\'s item and opens a delivery-acknowledgement item for a pending delivery', async () => {
  const open = timeline();
  await withOpenRequest(open);
  value(await open.service.endGeneration(SESSION, generation(1)));
  assert.deepEqual((await items(open)).map((item) => [item.kind, item.state]), [['permission-request', 'closed']]);
  const answered = timeline();
  await withOpenRequest(answered);
  value(await answered.service.consumeResponse(SESSION, response('answer-1')));
  value(await answered.service.endGeneration(SESSION, generation(1)));
  const found = await items(answered);
  assert.deepEqual(found.map((item) => [item.kind, item.state]), [['permission-request', 'resolved'], ['delivery-acknowledgement', 'open']]);
  assert.deepEqual([found[1]!.attemptId, found[1]!.attemptGeneration], [FIRST_ATTEMPT, ownership(1)]);
});

test('openItems lists a project\'s open items with their card subject and a fixed title, and the installation scope has none', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  const page = value(await subject.source.openItems({ kind: 'project', projectId: PROJECT }));
  assert.equal(page.position, '0');
  assert.deepEqual(page.items, [{
    id: 'item-1', sourceId: 'native-requests', kind: 'permission-request',
    subject: {
      scope: 'card', projectId: PROJECT, runId: CARD.runId, taskId: TASK, attemptId: FIRST_ATTEMPT, attemptGeneration: ownership(1),
      sessionId: SESSION, sessionGeneration: 1, nativeRequestId: 'request-1',
    },
    title: 'An agent session asks for a permission', createdAt: AT, answerableBy: 'project-operator', state: 'open',
  }]);
  assert.deepEqual(value(await subject.source.openItems({ kind: 'project', projectId: OTHER_CARD.projectId })).items, []);
  assert.deepEqual(value(await subject.source.openItems({ kind: 'project', projectId: PROJECT }, 'item-1')).items, []);
  assert.deepEqual(value(await subject.source.openItems({ kind: 'installation' })).items, []);
});

test('an inbox answer and a response reach one consumption: the second is already-answered, and a repeat returns the item', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  const resolved = value(await subject.source.answer(answer('item-1', 'inbox-1', { kind: 'permission-request', decision: 'deny' })));
  assert.deepEqual([resolved.state, resolved.state === 'resolved' && resolved.resolution.answer], ['resolved', { kind: 'permission-request', decision: 'deny' }]);
  const request = value(await subject.service.readSession(SESSION)).requests[0]!;
  assert.deepEqual(request.state === 'answered' && request.response.answer, { kind: 'permission', decision: 'deny' });
  const late = failed(await subject.service.consumeResponse(SESSION, response('answer-1')));
  assert.deepEqual([late.code, late.details.reason], ['conflict', ALREADY_ANSWERED]);
  assert.deepEqual(value(await subject.source.answer(answer('item-1', 'inbox-1', { kind: 'permission-request', decision: 'deny' }))), resolved);
  const reused = failed(await subject.source.answer(answer('item-1', 'inbox-1', { kind: 'permission-request', decision: 'allow' })));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', KEY_REUSED]);
});

test('an inbox answer of another kind is invalid, of an unknown item not-found, and of an expired request item-closed', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  assert.equal(failed(await subject.source.answer(answer('item-1', 'inbox-1', { kind: 'input-request', text: 'yes' }))).code, 'invalid');
  assert.equal(failed(await subject.source.answer(answer('item-9', 'inbox-1', { kind: 'permission-request', decision: 'allow' }))).code, 'not-found');
  value(await subject.service.recordTurnOutcome(SESSION, { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' }));
  const closed = failed(await subject.source.answer(answer('item-1', 'inbox-2', { kind: 'permission-request', decision: 'allow' })));
  assert.deepEqual([closed.code, closed.details.reason], ['precondition-failed', ITEM_CLOSED]);
});

test('an acknowledgement resolves its item once, audited, and sends no response, turn, or delivery', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  value(await subject.service.consumeResponse(SESSION, response('answer-1')));
  value(await subject.service.endGeneration(SESSION, generation(1)));
  const before = value(await subject.service.readSession(SESSION));
  const acknowledge = { kind: 'delivery-acknowledgement' as const, decision: 'acknowledge' as const };
  const resolved = value(await subject.source.answer(answer('item-2', 'ack-1', acknowledge)));
  assert.deepEqual(resolved.state === 'resolved' && resolved.resolution, { resolvedBy: AUTHOR, resolvedAt: AT, answer: acknowledge });
  assert.deepEqual(value(await subject.source.answer(answer('item-2', 'ack-1', acknowledge))), resolved, 'a repeat returns the item');
  const reused = failed(await subject.source.answer(answer('item-2', 'ack-1', acknowledge, OTHER_PRINCIPAL)));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', KEY_REUSED]);
  const second = failed(await subject.source.answer(answer('item-2', 'ack-2', acknowledge, OTHER_PRINCIPAL)));
  assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED]);
  assert.deepEqual(subject.store.auditEvents(), [{ kind: 'session.delivery-acknowledged', subject: 'item-2', actor: AUTHOR, occurredAt: AT }]);
  assert.deepEqual(value(await subject.service.readSession(SESSION)), before);
});

test('readSessions reads sessions in the order given, with the output window\'s bounds and no entry', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  value(await subject.service.appendOutput(SESSION, { turnId: turnId('turn-1'), generation: generation(1), text: 'output' }));
  value(await subject.service.openSession({ id: OTHER_SESSION, taskId: CHILD_TASK, harness: HARNESS }));
  const views = value(await subject.service.readSessions([OTHER_SESSION, SESSION]));
  assert.deepEqual(views.map((view) => [view.id, view.outputWindow]), [[OTHER_SESSION, { lastPosition: 0 }], [SESSION, { lastPosition: 1, earliestRetained: 1 }]]);
  assert.equal(JSON.stringify(views).includes('"output"'), false);
  assert.equal(failed(await subject.service.readSessions([SESSION, id('SessionId', 'session-9')])).code, 'not-found');
});

test('the in-memory scopes follow the task lineage: scope, card, and the card\'s sessions in code-unit order', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  value(await subject.service.openSession({ id: id('SessionId', 'Session-0'), taskId: TASK, harness: HARNESS }));
  value(await subject.service.openSession({ id: OTHER_SESSION, taskId: CHILD_TASK, harness: HARNESS }));
  assert.deepEqual(value(await subject.store.scopeOf(SESSION)), CARD);
  assert.equal(value(await subject.store.scopeOf(id('SessionId', 'session-9'))), undefined);
  assert.deepEqual([value(await subject.store.isCard(CARD.projectId, CARD.runId)), value(await subject.store.isCard(PROJECT, OTHER_CARD.runId))], [true, false]);
  assert.deepEqual(value(await subject.store.listByCard(CARD, undefined, 10)), ['Session-0', SESSION]);
  assert.deepEqual(value(await subject.store.listByCard(CARD, id('SessionId', 'Session-0'), 10)), [SESSION]);
  assert.deepEqual(value(await subject.store.listByCard(CARD, undefined, 1)), ['Session-0']);
});
