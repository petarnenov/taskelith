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
const SESSION = id('SessionId', 'session-1') as SessionId;
const TASK = id('TaskId', 'task-1') as TaskId;
const PERSON = id('PrincipalId', 'person-1');
const ALPHA: NeedsYouScope = { kind: 'project', projectId: 'alpha' as never };
const CLOCK = { now: () => value(parseInstant('2026-11-03T09:00:00.000Z')) };
const GENERATION = value(parseSessionGeneration(1));

const space = value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid: process.getuid!() }));
value(new SessionInputDigestKeyFile(space).create());
value(new SessionOutputTailKeyFile(space).create());
const sessions = value(startAgentSessionServices(space, database, CLOCK));

// Alpha's card `run-alpha` with `task-1`, whose session's generation 1
// holds the open native permission request `request-1`.
async function openRequest(): Promise<string> {
  await sql("INSERT INTO workflow_runs (id, generation, record, project_id, created_at) VALUES ('run-alpha', 1, '{}', 'alpha', now())");
  await sql(`INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id)
    VALUES ('task-1', NULL, 'task-1', 0, 'alpha', 'run-alpha')`);
  const { timeline } = sessions;
  value(await timeline.openSession({ id: SESSION, taskId: TASK, harness: id('HarnessPluginId', 'harness-a') }));
  const attempt = { attemptId: id('AttemptId', 'attempt-1'), taskId: TASK, ownershipGeneration: value(parseOwnershipGeneration(1)) };
  value(await timeline.bindAttempt(SESSION, attempt));
  value(await timeline.startGeneration(SESSION, { generation: GENERATION, nativeSessionId: id('NativeSessionId', 'native-1') }));
  const author = { kind: 'principal' as const, principalId: PERSON };
  const submitted = value(await timeline.submitTurn(SESSION, { key: id('IdempotencyKey', 'turn-1'), author, text: 'run it' }));
  value(await timeline.deliverTurn(SESSION, { turnId: submitted.turn.id, generation: GENERATION }));
  const key = { generation: GENERATION, nativeRequestId: id('NativeRequestId', 'request-1') };
  value(await timeline.recordRequest(SESSION, { key, kind: 'permission-request', turnId: submitted.turn.id, text: 'may I' }));
  const [row] = await sql<{ item_id: string }>('SELECT item_id FROM session_inbox_items');
  return row!.item_id;
}

// What an answer may change: the session with its request, its native key,
// its item, its audit, the events, and the inbox answer keys.
async function answerState(): Promise<unknown> {
  const tables = ['agent_sessions', 'session_idempotency_keys', 'session_inbox_items', 'session_audit_events', 'ui_events', 'inbox_answer_keys'];
  return Promise.all(tables.map((table) => sql(`SELECT * FROM ${table} ORDER BY 1`)));
}

// The composed answers, whose key recording fails after the source answered.
function failingKeyRecord(): InboxAnswers {
  return new InboxAnswers({
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
  const itemId = await openRequest();
  const before = await answerState();
  assert.equal(failed(await failingKeyRecord().answer(ALPHA, submission(itemId))).code, 'unavailable');
  assert.deepEqual(await answerState(), before, 'the native consumption rolled back with the key');
  const { answers } = startInboxServices(database, sessions);
  const answered = value(await answers.answer(ALPHA, submission(itemId)));
  assert.equal(answered.state, 'resolved');
  assert.deepEqual(value(await answers.answer(ALPHA, submission(itemId))), answered, 'the retry\'s key replays it');
  assert.deepEqual(await sql('SELECT state FROM session_inbox_items'), [{ state: 'resolved' }]);
  assert.equal((await sql('SELECT 1 FROM inbox_answer_keys')).length, 1);
});
