import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';
import {
  InboxAnswers,
  boardReadsOf,
  headPositions,
  startAgentSessionServices,
  startInboxServices,
  type InboxAnswerStore,
  type InboxAnswerSubmission,
} from '@taskelith/control-plane';
import { ControlPlaneNamespace, SessionInputDigestKeyFile, SessionOutputTailKeyFile } from '@taskelith/control-plane-store';
import { parseSessionGeneration, type NeedsYouScope, type SessionId } from '@taskelith/execution';
import { err, failure, parseIdentifier, parseInstant } from '@taskelith/kernel';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import { parseOwnershipGeneration, type TaskId } from '@taskelith/sdlc';
import { failed, integrationEndpoint, value } from '@taskelith/testing';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_native_answer_${process.pid}`;
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: POSTGRES.href });
await admin.connect();
await admin.query(`CREATE DATABASE ${databaseName}`);
value(await migrate(url));
const database = new PostgresDatabase(url);
const base = mkdtempSync(join(tmpdir(), 'taskelith-native-answer-'));
after(async () => {
  rmSync(base, { recursive: true, force: true });
  await database.close();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
});

async function sql<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
const PERSON = id('PrincipalId', 'person-1');
const ALPHA: NeedsYouScope = { kind: 'project', projectId: 'alpha' as never };
const CLOCK = { now: () => value(parseInstant('2026-11-03T09:00:00.000Z')) };
const GENERATION = value(parseSessionGeneration(1));

const space = value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid: process.getuid!() }));
value(new SessionInputDigestKeyFile(space).create());
value(new SessionOutputTailKeyFile(space).create());
const sessions = value(startAgentSessionServices(space, database, CLOCK));

// Alpha's card `run-<n>` with `task-<n>`, whose session `session-<n>`
// holds at generation 1 the open native permission request `request-1`.
async function openRequest(n: number): Promise<string> {
  const session = id('SessionId', `session-${n}`) as SessionId;
  const task = id('TaskId', `task-${n}`) as TaskId;
  await sql("INSERT INTO workflow_runs (id, generation, record, project_id, created_at) VALUES ($1, 1, '{}', 'alpha', now())", [`run-${n}`]);
  await sql(`INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id)
    VALUES ($1, NULL, $1, 0, 'alpha', $2)`, [task, `run-${n}`]);
  const { timeline } = sessions;
  value(await timeline.openSession({ id: session, taskId: task, harness: id('HarnessPluginId', 'harness-a') }));
  const attempt = { attemptId: id('AttemptId', `attempt-${n}`), taskId: task, ownershipGeneration: value(parseOwnershipGeneration(1)) };
  value(await timeline.bindAttempt(session, attempt));
  value(await timeline.startGeneration(session, { generation: GENERATION, nativeSessionId: id('NativeSessionId', `native-${n}`) }));
  const author = { kind: 'principal' as const, principalId: PERSON };
  const submitted = value(await timeline.submitTurn(session, { key: id('IdempotencyKey', 'turn-1'), author, text: 'run it' }));
  value(await timeline.deliverTurn(session, { turnId: submitted.turn.id, generation: GENERATION }));
  const key = { generation: GENERATION, nativeRequestId: id('NativeRequestId', 'request-1') };
  value(await timeline.recordRequest(session, { key, kind: 'permission-request', turnId: submitted.turn.id, text: 'may I' }));
  const [row] = await sql<{ item_id: string }>('SELECT item_id FROM session_inbox_items WHERE session_id = $1', [session]);
  return row!.item_id;
}

// What an answer may change: the session with its request, its native key,
// its item, its audit, the events, and the inbox answer keys.
async function answerState(): Promise<unknown> {
  const tables = ['agent_sessions', 'session_idempotency_keys', 'session_inbox_items', 'session_audit_events', 'ui_events', 'inbox_answer_keys'];
  return Promise.all(tables.map((table) => sql(`SELECT * FROM ${table} ORDER BY 1`)));
}

// The native source in a read-only snapshot, as the item read takes it.
const nativeSnapshot: InboxAnswerStore['snapshot'] = (work) => database.readOnly((tx) => {
  const reads = boardReadsOf(tx);
  return work([sessions.sourceIn(reads.timeline, headPositions(reads))]);
});

// The composed answers, whose key recording fails after the source answered.
function failingKeyRecord(): InboxAnswers {
  return new InboxAnswers({
    snapshot: nativeSnapshot,
    transaction: (work) => database.transaction((tx) => work({
      keys: { find: (itemId, key) => tx.inboxAnswerKeys.find(itemId, key), record: async () => err(failure('unavailable', 'the key store failed')) },
      sources: [sessions.sourceIn(tx.sessionTimeline, headPositions(boardReadsOf(tx)))],
    })),
  }, sessions.digest);
}

function submission(itemId: string): InboxAnswerSubmission {
  return { itemId: itemId as never, responder: PERSON as never, answer: { kind: 'permission-request', decision: 'allow' }, idempotencyKey: 'key-1' as never };
}

test('a native answer whose inbox key fails to record rolls back with it, and a retry answers once', async () => {
  const itemId = await openRequest(1);
  const before = await answerState();
  assert.equal(failed(await failingKeyRecord().answer(ALPHA, submission(itemId))).code, 'unavailable');
  assert.deepEqual(await answerState(), before, 'the native consumption rolled back with the key');
  const { answers } = startInboxServices(database, sessions);
  const answered = value(await answers.answer(ALPHA, submission(itemId)));
  assert.equal(answered.state, 'resolved');
  assert.deepEqual(value(await answers.answer(ALPHA, submission(itemId))), answered, 'the retry\'s key replays it');
  assert.deepEqual(await sql('SELECT state FROM session_inbox_items WHERE item_id = $1', [itemId]), [{ state: 'resolved' }]);
  assert.equal((await sql('SELECT 1 FROM inbox_answer_keys WHERE item_id = $1', [itemId])).length, 1);
});

// Holds each of the first `parties` key reads until all of them read, so
// every answer passes the key check before any commits.
function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await open;
  };
}

// The composed answers over the native source, with the key reads held.
function racingAnswers(wait: () => Promise<void>): InboxAnswers {
  return new InboxAnswers({
    snapshot: nativeSnapshot,
    transaction: (work) => database.transaction((tx) => work({
      keys: {
        find: async (itemId, key) => {
          const found = await tx.inboxAnswerKeys.find(itemId, key);
          await wait();
          return found;
        },
        record: (answer) => tx.inboxAnswerKeys.record(answer),
      },
      sources: [sessions.sourceIn(tx.sessionTimeline, headPositions(boardReadsOf(tx)))],
    })),
  }, sessions.digest);
}

test('two concurrent identical native answers commit one answer and one native key, and both return it', async () => {
  const itemId = await openRequest(2);
  const nativeKeys = "SELECT count(*)::int AS count FROM session_idempotency_keys WHERE session_id = 'session-2'";
  const [before] = await sql<{ count: number }>(nativeKeys);
  const answers = racingAnswers(barrier(2));
  const [first, second] = await Promise.all([1, 2].map(() => answers.answer(ALPHA, submission(itemId))));
  assert.equal(value(first!).state, 'resolved');
  assert.deepEqual(value(second!), value(first!));
  assert.deepEqual(await sql('SELECT state FROM session_inbox_items WHERE item_id = $1', [itemId]), [{ state: 'resolved' }]);
  assert.equal((await sql('SELECT 1 FROM inbox_answer_keys WHERE item_id = $1', [itemId])).length, 1);
  assert.deepEqual(await sql(nativeKeys), [{ count: before!.count + 1 }], 'the native source consumed the answer once');
});
