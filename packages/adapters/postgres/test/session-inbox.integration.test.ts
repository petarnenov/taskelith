import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  ALREADY_ANSWERED,
  BEFORE_ANY_EVENT,
  ITEM_CLOSED,
  NativeRequestSource,
  type IdempotencyKey,
  type NeedsYouItemId,
  type NeedsYouSourceId,
  type PrincipalId,
  type SessionId,
  type SessionScope,
  type SessionTimelineService,
  type SessionTimelineStore,
  type SessionTimelineTransaction,
} from '@taskelith/execution';
import { instantFromEpochMilliseconds, parseIdentifier } from '@taskelith/kernel';
import { PostgresDatabase, PostgresSessionScopes, PostgresSessionTimelineStore } from '@taskelith/postgres';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import { HmacInputDigest } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';
import {
  Barrier,
  HARNESS,
  OTHER_SESSION,
  SESSION,
  TASK,
  allow,
  barrierStore,
  generation,
  postgresService,
  sessionWithOpenRequest,
  timelineService,
  turn,
} from './session-timeline-fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());
const service = postgresService(database);
const scopes = new PostgresSessionScopes(database);

const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
const PROJECT = id('ProjectId', 'alpha') as ProjectId;
const CARD: SessionScope = { projectId: PROJECT, runId: id('RunId', 'run-alpha') as WorkflowRunId };
const PERSON = id('PrincipalId', 'person-1') as PrincipalId;
const OTHER_PERSON = id('PrincipalId', 'person-2') as PrincipalId;
const ACKNOWLEDGE = { kind: 'delivery-acknowledgement' as const, decision: 'acknowledge' as const };

// TASK is a root task of `run-alpha` in project alpha; `task-child` is its
// delegated child in the child run `run-child`; `run-beta` is beta's.
async function lineage(): Promise<void> {
  await query(url, `INSERT INTO workflow_runs (id, generation, record, project_id, created_at) VALUES
    ('run-alpha', 1, '{}', 'alpha', now()), ('run-child', 1, '{}', 'alpha', now()), ('run-beta', 1, '{}', 'beta', now())`);
  await query(url, `INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id) VALUES
    ('task-1', NULL, 'task-1', 0, 'alpha', 'run-alpha'), ('task-child', 'task-1', 'task-1', 1, 'alpha', 'run-child'),
    ('task-beta', NULL, 'task-beta', 0, 'beta', 'run-beta')`);
}

function source(store: SessionTimelineStore, timeline: SessionTimelineService = timelineService(store)): NativeRequestSource {
  const digest = value(HmacInputDigest.fromKey(Buffer.alloc(32, 0x5a)));
  const clock = { now: () => value(instantFromEpochMilliseconds(Date.now())) };
  return new NativeRequestSource({ id: 'native-requests' as NeedsYouSourceId, store, timeline, digest, clock, positions: BEFORE_ANY_EVENT });
}

const answer = (itemId: string, key: string, given: object, responder: PrincipalId = PERSON) => ({
  itemId: itemId as NeedsYouItemId, responder, answer: given as never, idempotencyKey: id('IdempotencyKey', key) as IdempotencyKey,
});

async function itemRows(): Promise<{ item_id: string; kind: string; state: string }[]> {
  return query(url, 'SELECT item_id, kind, state FROM session_inbox_items ORDER BY kind, native_request_id');
}

async function auditRows(): Promise<number> {
  const [row] = await query<{ events: number }>(url, 'SELECT count(*)::int AS events FROM session_audit_events');
  return row!.events;
}

// Each transaction of the first attempt waits at the barrier after its first
// item read, so every party has read the item before any writes.
function itemBarrierStore(store: SessionTimelineStore, barrier: Barrier): SessionTimelineStore {
  let arrived = false;
  const gated = (tx: SessionTimelineTransaction): SessionTimelineTransaction => ({
    ...tx,
    sessions: tx.sessions,
    idempotency: tx.idempotency,
    audit: tx.audit,
    items: {
      find: (...args) => tx.items.find(...args),
      add: (item) => tx.items.add(item),
      settle: (item) => tx.items.settle(item),
      listOpen: (...args) => tx.items.listOpen(...args),
      get: async (itemId) => {
        const read = await tx.items.get(itemId);
        if (!arrived) {
          arrived = true;
          await barrier.arrive();
        }
        return read;
      },
    },
  });
  return { transaction: (work) => store.transaction((tx) => work(gated(tx))) };
}

// An answered permission request whose generation ended, so its delivery
// is uncertain and its acknowledgement item is open.
async function uncertainDelivery(): Promise<string> {
  await sessionWithOpenRequest(service);
  value(await service.consumeResponse(SESSION, allow('answer-1')));
  value(await service.endGeneration(SESSION, generation(1)));
  return (await itemRows()).find((row) => row.kind === 'delivery-acknowledgement')!.item_id;
}

test.describe('session inbox items on PostgreSQL', { concurrency: false }, () => {
  beforeEach(async () => {
    await truncateAll(url);
    await lineage();
  });

  test('a session\'s scope is its task\'s project and its lineage root\'s run, also for a delegated child task', async () => {
    value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
    value(await service.openSession({ id: OTHER_SESSION, taskId: id('TaskId', 'task-child') as never, harness: HARNESS }));
    value(await service.openSession({ id: id('SessionId', 'session-orphan'), taskId: id('TaskId', 'task-none') as never, harness: HARNESS }));
    assert.deepEqual(value(await scopes.scopeOf(SESSION)), CARD);
    assert.deepEqual(value(await scopes.scopeOf(OTHER_SESSION)), CARD);
    assert.equal(value(await scopes.scopeOf(id('SessionId', 'session-orphan'))), undefined);
    assert.equal(value(await scopes.scopeOf(id('SessionId', 'session-9'))), undefined);
  });

  test('a card is a root run of the project: a child run, a run of another project, and an unknown run are none', async () => {
    const isCard = async (project: string, run: string) => value(await scopes.isCard(id('ProjectId', project) as ProjectId, id('RunId', run) as WorkflowRunId));
    assert.deepEqual(
      [await isCard('alpha', 'run-alpha'), await isCard('alpha', 'run-child'), await isCard('alpha', 'run-beta'), await isCard('alpha', 'run-none')],
      [true, false, false, false],
    );
  });

  test('a card lists the sessions of its tasks and of their delegated children in code-unit order, after a key, to a limit', async () => {
    for (const [name, task] of [['session-b', 'task-1'], ['Session-c', 'task-child'], ['session-a', 'task-1'], ['session-z', 'task-beta']] as const) {
      value(await service.openSession({ id: id('SessionId', name), taskId: id('TaskId', task) as never, harness: HARNESS }));
    }
    assert.deepEqual(value(await scopes.listByCard(CARD, undefined, 10)), ['Session-c', 'session-a', 'session-b']);
    assert.deepEqual(value(await scopes.listByCard(CARD, id('SessionId', 'session-a') as SessionId, 10)), ['session-b']);
    assert.deepEqual(value(await scopes.listByCard(CARD, undefined, 2)), ['Session-c', 'session-a']);
  });

  test('open items list by the project of their session with its card, and an item of another project is not listed', async () => {
    await sessionWithOpenRequest(service);
    const listed = value(await source(new PostgresSessionTimelineStore(database)).openItems({ kind: 'project', projectId: PROJECT }));
    assert.deepEqual(listed.items.map((item) => [item.kind, item.state, item.subject.scope === 'card' && item.subject.runId]), [['permission-request', 'open', 'run-alpha']]);
    const beta = value(await source(new PostgresSessionTimelineStore(database)).openItems({ kind: 'project', projectId: id('ProjectId', 'beta') as ProjectId }));
    assert.deepEqual(beta.items, []);
  });

  test('a change that leaves the requests as they were leaves their item rows unwritten', async () => {
    await sessionWithOpenRequest(service);
    const itemVersion = () => query<{ xmin: string }>(url, 'SELECT xmin::text AS xmin FROM session_inbox_items');
    const before = await itemVersion();
    value(await service.submitTurn(SESSION, turn('key-2')));
    assert.deepEqual(await itemVersion(), before);
  });

  test('a response racing an inbox answer of one request consumes one, the other fails already-answered, and the item resolves once', async () => {
    await sessionWithOpenRequest(service);
    const [itemId] = (await itemRows()).map((row) => row.item_id);
    const barrier = new Barrier(2);
    const responder = timelineService(barrierStore(new PostgresSessionTimelineStore(database), barrier));
    const inboxStore = barrierStore(new PostgresSessionTimelineStore(database), barrier);
    const inbox = source(inboxStore, timelineService(inboxStore));
    const results = await Promise.all([
      responder.consumeResponse(SESSION, allow('answer-1')),
      inbox.answer(answer(itemId!, 'inbox-1', { kind: 'permission-request', decision: 'deny' })),
    ]);
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    const loser = failed(results.find((result) => !result.ok)!);
    assert.deepEqual([loser.code, loser.details.reason], ['conflict', ALREADY_ANSWERED]);
    assert.deepEqual((await itemRows()).map((row) => row.state), ['resolved']);
    assert.equal(value(await service.readSession(SESSION)).requests[0]!.state, 'answered');
  });

  test('one key used by a response and then an inbox answer, or the reverse, answers the second already-answered', async () => {
    const permission = (decision: string) => ({ kind: 'permission-request', decision });
    await sessionWithOpenRequest(service);
    const [itemId] = (await itemRows()).map((row) => row.item_id);
    value(await service.consumeResponse(SESSION, allow('shared-1')));
    for (const decision of ['allow', 'deny']) {
      const second = failed(await source(new PostgresSessionTimelineStore(database)).answer(answer(itemId!, 'shared-1', permission(decision))));
      assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED], decision);
    }
    await truncateAll(url);
    await lineage();
    await sessionWithOpenRequest(service);
    const [answeredId] = (await itemRows()).map((row) => row.item_id);
    value(await source(new PostgresSessionTimelineStore(database)).answer(answer(answeredId!, 'shared-1', permission('allow'))));
    const second = failed(await service.consumeResponse(SESSION, allow('shared-1')));
    assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED]);
  });

  test('a standing rule racing an inbox answer: the rule closes the item and the answer fails item-closed, or the rule fails', async () => {
    await sessionWithOpenRequest(service);
    const [itemId] = (await itemRows()).map((row) => row.item_id);
    const barrier = new Barrier(2);
    const rule = timelineService(barrierStore(new PostgresSessionTimelineStore(database), barrier));
    const inboxStore = barrierStore(new PostgresSessionTimelineStore(database), barrier);
    const ruled = allow('rule-1');
    const [byRule, byInbox] = await Promise.all([
      rule.consumeResponse(SESSION, { ...ruled, response: { ...ruled.response, responder: { kind: 'standing-rule', ruleId: id('StandingRuleId', 'rule-1') } } }),
      source(inboxStore, timelineService(inboxStore)).answer(answer(itemId!, 'inbox-1', { kind: 'permission-request', decision: 'deny' })),
    ]);
    const loser = failed(byRule.ok ? byInbox : byRule);
    const expected = byRule.ok ? ['precondition-failed', ITEM_CLOSED, 'closed'] : ['conflict', ALREADY_ANSWERED, 'resolved'];
    assert.deepEqual([loser.code, loser.details.reason, (await itemRows())[0]!.state], expected);
  });

  test('two acknowledgements of one item under two keys resolve it once with one audit event, and the other fails already-answered', async () => {
    const itemId = await uncertainDelivery();
    const barrier = new Barrier(2);
    const racers = [PERSON, OTHER_PERSON].map((person, index) => {
      const store = itemBarrierStore(new PostgresSessionTimelineStore(database), barrier);
      return source(store).answer(answer(itemId, `ack-${index}`, ACKNOWLEDGE, person));
    });
    const results = await Promise.all(racers);
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    assert.deepEqual(failed(results.find((result) => !result.ok)!).details.reason, ALREADY_ANSWERED);
    assert.equal(await auditRows(), 1);
    const request = value(await service.readSession(SESSION)).requests[0]!;
    assert.deepEqual(request.state === 'answered' && request.response.delivery, 'delivery-uncertain', 'nothing is resent or reported');
  });

  test('an acknowledgement repeated with its key after a new pool returns the item and audits nothing more', async () => {
    const itemId = await uncertainDelivery();
    const first = value(await source(new PostgresSessionTimelineStore(database)).answer(answer(itemId, 'ack-1', ACKNOWLEDGE)));
    const restarted = new PostgresDatabase(url);
    try {
      assert.deepEqual(value(await source(new PostgresSessionTimelineStore(restarted)).answer(answer(itemId, 'ack-1', ACKNOWLEDGE))), first);
    } finally {
      await restarted.close();
    }
    assert.equal(await auditRows(), 1);
  });

  test('an answer racing its generation end is answered with an acknowledgement item, or not-found with a closed item', async () => {
    await sessionWithOpenRequest(service);
    const barrier = new Barrier(2);
    const [left, right] = [0, 1].map(() => timelineService(barrierStore(new PostgresSessionTimelineStore(database), barrier)));
    const [answered, ended] = await Promise.all([left!.consumeResponse(SESSION, allow('answer-1')), right!.endGeneration(SESSION, generation(1))]);
    value(ended);
    const items = (await itemRows()).map((row) => `${row.kind}:${row.state}`);
    if (answered.ok) assert.deepEqual(items, ['delivery-acknowledgement:open', 'permission-request:resolved']);
    else assert.deepEqual([failed(answered).code, items], ['not-found', ['permission-request:closed']]);
  });
});
