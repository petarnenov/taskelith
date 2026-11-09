import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant } from '@taskelith/kernel';
import {
  BEFORE_ANY_EVENT,
  InMemorySessionTimelineStore,
  InMemoryTaskLineage,
  InMemoryUiEventLog,
  NATIVE_REQUEST_SOURCE_ID,
  NativeRequestSource,
  SessionTimelineService,
  projectScope,
  type LoggedEntry,
  type NeedsYouItemId,
  type UiEventRecord,
} from '@taskelith/execution';
import type { ProjectId } from '@taskelith/sdlc';
import { sequentialIds, value } from '@taskelith/testing';
import {
  AUTHOR,
  FLIPPING_CIPHER,
  HARNESS,
  NATIVE,
  OTHER_SESSION,
  PERSON,
  SESSION,
  TASK,
  allow,
  binding,
  generation,
  permissionRequest,
  requestKey,
  taskId,
  trailingRunRedactor,
  turnId,
  turnKey,
  COMMAND_DEPENDENCIES,
} from './session-fixtures.ts';

const CLOCK = { now: () => value(parseInstant('2026-11-03T09:00:00.000Z')) };
const redact = (text: string) => text.replaceAll(/SECRET\S*/g, '[redacted]');
const ALPHA = 'alpha' as ProjectId;
const FIRST = generation(1);
const TURN = turnId('turn-1');
const LINEAGE = {
  runs: [{ runId: 'run-alpha', projectId: ALPHA }],
  tasks: [{ taskId: TASK, rootTaskId: TASK, depth: 0, projectId: ALPHA, runId: 'run-alpha' }],
};
const ALPHA_STREAM = { scope: projectScope(ALPHA) };

function timeline() {
  const log = new InMemoryUiEventLog();
  const store = new InMemorySessionTimelineStore(new InMemoryTaskLineage(LINEAGE), log);
  const digest = { digest: (input: string) => `digest:${input}` };
  const service = new SessionTimelineService({
    store, digest, redactor: { redact }, outputRedactor: trailingRunRedactor(redact),
    tailCipher: FLIPPING_CIPHER, turnIds: sequentialIds('TurnId', 'turn'), clock: CLOCK, itemIds: sequentialIds('NeedsYouItemId', 'item'),
    ...COMMAND_DEPENDENCIES,
  });
  return { log, store, service, digest };
}

// Numbers what was committed and reads every entry of project alpha.
async function published(log: InMemoryUiEventLog): Promise<readonly LoggedEntry[]> {
  value(await log.assign(1_000, CLOCK.now()));
  const { head } = value(await log.bounds());
  return value(await log.readAfter(0, head, ALPHA_STREAM, 1_000));
}

function records(entries: readonly LoggedEntry[]): readonly UiEventRecord[] {
  return entries.flatMap((entry) => (entry.kind === 'event' ? [entry.event.record] : []));
}

const types = (entries: readonly LoggedEntry[]) => records(entries).map((record) => record.type);

async function runningTurn(service: SessionTimelineService): Promise<void> {
  value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(SESSION, binding()));
  value(await service.startGeneration(SESSION, { generation: FIRST, nativeSessionId: NATIVE }));
  value(await service.submitTurn(SESSION, { key: turnKey('key-1'), author: PERSON, text: 'go' }));
  value(await service.deliverTurn(SESSION, { turnId: TURN, generation: FIRST }));
}

test('each change of a session publishes its events in its transaction, in the order of the change', async () => {
  const { log, service } = timeline();
  await runningTurn(service);
  assert.deepEqual(types(await published(log)), [
    'agent-session-changed', 'agent-session-changed', 'agent-session-changed', 'turn-changed', 'turn-changed',
  ]);
  const entries = await published(log);
  assert.deepEqual(entries.map((entry) => entry.position), [1, 2, 3, 4, 5]);
  const opened = records(entries)[0] as Extract<UiEventRecord, { type: 'agent-session-changed' }>;
  assert.deepEqual([opened.card, opened.session.turnCount, opened.session.requestCount], [{ projectId: ALPHA, runId: 'run-alpha' }, 0, 0]);
  assert.equal('turns' in opened.session, false, 'the summary carries no turn records');
  const delivered = records(entries)[4] as Extract<UiEventRecord, { type: 'turn-changed' }>;
  assert.deepEqual([delivered.sessionId, delivered.turn.state], [SESSION, 'delivered']);
  assert.ok(entries.every((entry) => entry.kind === 'event' && entry.event.occurredAt === CLOCK.now()));
});

test('a stored command ID adds no event: a generation start publishes the session change alone', async () => {
  const { log, service } = timeline();
  value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(SESSION, binding()));
  value(await service.submitTurn(SESSION, { key: turnKey('key-1'), author: PERSON, text: 'go' }));
  const before = (await published(log)).length;

  value(await service.startGeneration(SESSION, { generation: FIRST, nativeSessionId: NATIVE }));

  assert.deepEqual(records(await published(log)).slice(before).map((record) => record.type), ['agent-session-changed']);
});

test('a recorded request publishes its record with its place and its open inbox item, and an answer both changes', async () => {
  const { log, service } = timeline();
  await runningTurn(service);
  const before = (await published(log)).length;
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-1'), turnId: TURN }));
  value(await service.consumeResponse(SESSION, { key: turnKey('answer-1'), response: allow('request-1') }));
  const recorded = records(await published(log)).slice(before);
  assert.deepEqual(recorded.map((record) => record.type), ['native-request-changed', 'inbox-item-changed', 'native-request-changed', 'inbox-item-changed']);
  const [request, item, answered, resolved] = recorded as [
    Extract<UiEventRecord, { type: 'native-request-changed' }>, Extract<UiEventRecord, { type: 'inbox-item-changed' }>,
    Extract<UiEventRecord, { type: 'native-request-changed' }>, Extract<UiEventRecord, { type: 'inbox-item-changed' }>,
  ];
  assert.deepEqual([request.position, request.request.state, answered.request.state], [1, 'open', 'answered']);
  assert.deepEqual([item.item.sourceId, item.item.state, item.item.kind], [NATIVE_REQUEST_SOURCE_ID, 'open', 'permission-request']);
  assert.deepEqual([resolved.item.id, resolved.item.state], [item.item.id, 'resolved']);
});

test('output publishes only released entries: a held tail publishes nothing until it is released', async () => {
  const { log, service } = timeline();
  await runningTurn(service);
  const before = (await published(log)).length;
  value(await service.appendOutput(SESSION, { turnId: TURN, generation: FIRST, text: 'key SEC' }));
  const afterHeld = records(await published(log)).slice(before);
  assert.deepEqual(afterHeld.map((record) => record.type === 'output-appended' ? record.entry.text : record.type), ['key ']);
  value(await service.appendOutput(SESSION, { turnId: TURN, generation: FIRST, text: 'RET more\n' }));
  const released = records(await published(log)).slice(before + 1);
  assert.deepEqual(released.map((record) => record.type === 'output-appended' ? record.entry.text : record.type), ['[redacted] more\n']);
});

test('a repeated turn, a failed change, and a session outside any scope publish nothing', async () => {
  const { log, service } = timeline();
  await runningTurn(service);
  const before = (await published(log)).length;
  value(await service.submitTurn(SESSION, { key: turnKey('key-1'), author: PERSON, text: 'go' }));
  assert.equal((await service.deliverTurn(SESSION, { turnId: turnId('turn-9'), generation: FIRST })).ok, false);
  value(await service.openSession({ id: OTHER_SESSION, taskId: taskId('task-unscoped'), harness: HARNESS }));
  assert.equal((await published(log)).length, before);
  const everything = value(await log.readAfter(0, value(await log.bounds()).head, { scope: projectScope('beta' as ProjectId) }, 1_000));
  assert.deepEqual([everything.length, value(await log.bounds()).head], [0, before]);
});

test('an acknowledged uncertain delivery publishes its resolved item through its source', async () => {
  const { log, service, store, digest } = timeline();
  await runningTurn(service);
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-1'), turnId: TURN }));
  value(await service.consumeResponse(SESSION, { key: turnKey('answer-1'), response: allow('request-1') }));
  value(await service.recordDeliveryReport(SESSION, requestKey('request-1'), 'delivery-uncertain'));
  const source = new NativeRequestSource({ id: NATIVE_REQUEST_SOURCE_ID, store, timeline: service, digest, clock: CLOCK, positions: BEFORE_ANY_EVENT });
  const opened = records(await published(log)).filter((record) => record.type === 'inbox-item-changed').at(-1) as Extract<UiEventRecord, { type: 'inbox-item-changed' }>;
  assert.deepEqual([opened.item.kind, opened.item.state], ['delivery-acknowledgement', 'open']);
  const before = (await published(log)).length;
  value(await source.answer({
    scope: { kind: 'project', projectId: (opened.item.subject as { projectId: ProjectId }).projectId },
    itemId: opened.item.id as NeedsYouItemId, responder: AUTHOR, idempotencyKey: turnKey('ack-1'),
    answer: { kind: 'delivery-acknowledgement', decision: 'acknowledge' },
  }));
  const after = records(await published(log)).slice(before);
  assert.deepEqual(after.map((record) => record.type === 'inbox-item-changed' ? `${record.item.kind}:${record.item.state}` : record.type),
    ['delivery-acknowledgement:resolved']);
});
