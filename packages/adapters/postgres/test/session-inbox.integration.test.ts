import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import {
  ALREADY_ANSWERED,
  BEFORE_ANY_EVENT,
  ITEM_CLOSED,
  NativeRequestSource,
  SCOPES_LINEAGE,
  SESSION_SCOPES_CONFORMANCE,
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

// The runs and task lineage of SCOPES_LINEAGE, in which TASK is the root
// task of alpha's card `run-alpha`.
async function lineage(): Promise<void> {
  for (const run of SCOPES_LINEAGE.runs) {
    await query(url, "INSERT INTO workflow_runs (id, generation, record, project_id, created_at) VALUES ($1, 1, '{}', $2, now())", [run.runId, run.projectId]);
  }
  for (const task of SCOPES_LINEAGE.tasks) {
    await query(url, `INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [task.taskId, task.parentTaskId ?? null, task.rootTaskId, task.depth, task.projectId, task.runId]);
  }
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

// The ID of the open request's item, which recording the request opened.
async function openItemId(): Promise<string> {
  const [row] = await itemRows();
  assert.ok(row !== undefined, 'the recorded permission request opened no item');
  return row.item_id;
}

async function auditRows(): Promise<number> {
  const [row] = await query<{ events: number }>(url, 'SELECT count(*)::int AS events FROM session_audit_events');
  return row!.events;
}

// The writing transaction of an acknowledgement reads the item, then its
// key. Its first attempt waits at the barrier after that key read, so both
// parties have read the open item in their writing transactions before
// either writes; `keyReads` counts the attempts.
function acknowledgementBarrierStore(store: SessionTimelineStore, barrier: Barrier, keyReads: { count: number }): SessionTimelineStore {
  let arrived = false;
  const gated = (tx: SessionTimelineTransaction): SessionTimelineTransaction => ({
    ...tx,
    idempotency: {
      record: (sessionId, record) => tx.idempotency.record(sessionId, record),
      find: async (...args) => {
        const read = await tx.idempotency.find(...args);
        keyReads.count += 1;
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

// The first transaction waits at the barrier after it listed a card's
// sessions, before it reads any of them.
function listingBarrierStore(store: SessionTimelineStore, barrier: Barrier): SessionTimelineStore {
  let arrived = false;
  const gated = (tx: SessionTimelineTransaction): SessionTimelineTransaction => ({
    ...tx,
    scopes: {
      scopeOf: (sessionId) => tx.scopes.scopeOf(sessionId),
      isCard: (projectId, runId) => tx.scopes.isCard(projectId, runId),
      listByCard: async (...args) => {
        const listed = await tx.scopes.listByCard(...args);
        if (!arrived) {
          arrived = true;
          await barrier.arrive();
        }
        return listed;
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
  const row = (await itemRows()).find((candidate) => candidate.kind === 'delivery-acknowledgement');
  assert.ok(row !== undefined, 'the uncertain delivery opened no acknowledgement item');
  return row.item_id;
}

test.describe('session inbox items on PostgreSQL', { concurrency: false }, () => {
  beforeEach(async () => {
    await truncateAll(url);
    await lineage();
  });

  for (const conformance of SESSION_SCOPES_CONFORMANCE) {
    test(`PostgreSQL session scopes: ${conformance.name}`, async () => {
      assert.deepEqual(await conformance.check({ scopes, store: new PostgresSessionTimelineStore(database) }), []);
    });
  }

  test('a card\'s page is one state: a session added and a turn submitted after its listing show in neither', async () => {
    await sessionWithOpenRequest(service);
    const barrier = new Barrier(2);
    const reader = timelineService(listingBarrierStore(new PostgresSessionTimelineStore(database), barrier));
    const [page] = await Promise.all([
      reader.readCardSessions(CARD, undefined, 10),
      (async () => {
        value(await service.openSession({ id: id('SessionId', 'session-0') as SessionId, taskId: TASK, harness: HARNESS }));
        value(await service.submitTurn(SESSION, turn('key-2')));
        await barrier.arrive();
      })(),
    ]);
    const shown = (result: typeof page) => value(result).sessions.map((session) => [session.id, session.turns.length]);
    assert.deepEqual(shown(page), [[SESSION, 1]]);
    assert.deepEqual(shown(await service.readCardSessions(CARD, undefined, 10)), [['session-0', 0], [SESSION, 2]]);
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
    const itemId = await openItemId();
    const barrier = new Barrier(2);
    const responder = timelineService(barrierStore(new PostgresSessionTimelineStore(database), barrier));
    const inboxStore = barrierStore(new PostgresSessionTimelineStore(database), barrier);
    const inbox = source(inboxStore, timelineService(inboxStore));
    const results = await Promise.all([
      responder.consumeResponse(SESSION, allow('answer-1')),
      inbox.answer(answer(itemId, 'inbox-1', { kind: 'permission-request', decision: 'deny' })),
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
    const itemId = await openItemId();
    value(await service.consumeResponse(SESSION, allow('shared-1')));
    for (const decision of ['allow', 'deny']) {
      const second = failed(await source(new PostgresSessionTimelineStore(database)).answer(answer(itemId, 'shared-1', permission(decision))));
      assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED], decision);
    }
    await truncateAll(url);
    await lineage();
    await sessionWithOpenRequest(service);
    const answeredId = await openItemId();
    value(await source(new PostgresSessionTimelineStore(database)).answer(answer(answeredId, 'shared-1', permission('allow'))));
    const second = failed(await service.consumeResponse(SESSION, allow('shared-1')));
    assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED]);
  });

  test('a standing rule racing an inbox answer: the rule closes the item and the answer fails item-closed, or the rule fails', async () => {
    await sessionWithOpenRequest(service);
    const itemId = await openItemId();
    const barrier = new Barrier(2);
    const rule = timelineService(barrierStore(new PostgresSessionTimelineStore(database), barrier));
    const inboxStore = barrierStore(new PostgresSessionTimelineStore(database), barrier);
    const ruled = allow('rule-1');
    const [byRule, byInbox] = await Promise.all([
      rule.consumeResponse(SESSION, { ...ruled, response: { ...ruled.response, responder: { kind: 'standing-rule', ruleId: id('StandingRuleId', 'rule-1') } } }),
      source(inboxStore, timelineService(inboxStore)).answer(answer(itemId, 'inbox-1', { kind: 'permission-request', decision: 'deny' })),
    ]);
    const loser = failed(byRule.ok ? byInbox : byRule);
    const expected = byRule.ok ? ['precondition-failed', ITEM_CLOSED, 'closed'] : ['conflict', ALREADY_ANSWERED, 'resolved'];
    assert.deepEqual([loser.code, loser.details.reason, (await itemRows())[0]!.state], expected);
  });

  test('two acknowledgements of one item under two keys resolve it once with one audit event, and the other fails already-answered', async () => {
    const itemId = await uncertainDelivery();
    const barrier = new Barrier(2);
    const keyReads = { count: 0 };
    const racers = [PERSON, OTHER_PERSON].map((person, index) => {
      const store = acknowledgementBarrierStore(new PostgresSessionTimelineStore(database), barrier, keyReads);
      return source(store).answer(answer(itemId, `ack-${index}`, ACKNOWLEDGE, person));
    });
    const results = await Promise.all(racers);
    assert.equal(keyReads.count, 3, 'the loser\'s writing transaction overlapped the winner\'s and was retried once');
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
