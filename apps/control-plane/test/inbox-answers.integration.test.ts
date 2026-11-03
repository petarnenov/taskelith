import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import pg from 'pg';
import {
  InboxAnswers,
  LaunchRevokingFleetRegistry,
  ReconciliationSource,
  TransactionalReconciliationResolver,
  boardReadsOf,
  headPositions,
  startBoardServices,
  startInboxServices,
  type InboxAnswerSubmission,
} from '@taskelith/control-plane';
import {
  ALREADY_ANSWERED,
  ATTEMPT_NOT_CURRENT,
  ITEM_CLOSED,
  KEY_REUSED,
  recordExecutionEvidence,
  recordExit,
  recordNotStarted,
  type InboxAnswerKeys,
  type NeedsYouAnswer,
  type NeedsYouItem,
  type NeedsYouScope,
  type NeedsYouSource,
  type ObservationResult,
  type Task,
} from '@taskelith/execution';
import { fleetToken, fleetWorker } from '@taskelith/fleet';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import { NodeSecrets, SecretTextRedactor } from '@taskelith/secrets';
import { failed, integrationEndpoint, value } from '@taskelith/testing';
import { createLaunchRun, launchAuthority, placedTask } from './launch-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_answers_${process.pid}`;
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: POSTGRES.href });
await admin.connect();
await admin.query(`CREATE DATABASE ${databaseName}`);
value(await migrate(url));
const database = new PostgresDatabase(url);
after(async () => {
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

const PROJECT: NeedsYouScope = { kind: 'project', projectId: 'project-1' as never };
const INSTALLATION: NeedsYouScope = { kind: 'installation' };
const WORKER = fleetWorker('worker-1', 'journal-1');
const SECRET = new NodeSecrets().issue('worker').secret;
const DIGEST = { digest: (input: string) => `digest:${input}` };

// No native request is open in these tests.
const NO_REQUESTS: NeedsYouSource = {
  id: 'native-requests' as never, kinds: ['permission-request'], openItems: async () => ok({ items: [], position: '0' }),
  item: async () => ok(undefined), answer: async () => ok(undefined as never),
};
const SESSIONS = { sourceIn: () => NO_REQUESTS, digest: DIGEST };

const RESOLVE: NeedsYouAnswer = {
  kind: 'reconciliation', decision: 'resolve-execution', evidence: 'incident-7' as never, reason: `host lost, token ${SECRET}`,
};
const acknowledge = (reason = 'handled outside'): NeedsYouAnswer => ({
  kind: 'reconciliation', decision: 'acknowledge-process', evidence: 'incident-8' as never, reason,
});

function submission(itemId: string, key: string, answer: NeedsYouAnswer): InboxAnswerSubmission {
  return { itemId: itemId as never, responder: 'person-1' as never, answer, idempotencyKey: key as never };
}

beforeEach(async () => {
  await sql(`TRUNCATE workflow_runs, gates, admissions, tasks, assignments, outbox, inbox, task_lineage, capacity_charges, delegations,
    capacity_quotas, workers, installation, enrollment_tokens, broker_revocations, launch_authorizations, launch_rejections, current_revisions,
    producer_cursors, worker_self_check_results, unrecorded_processes, cards, card_touches, ui_events, inbox_answer_keys, reconciliation_answers, reconciliation_item_projections`);
  await sql('INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  const fleet = new LaunchRevokingFleetRegistry(database);
  value(await fleet.addToken(fleetToken('token-1')));
  value(await fleet.enroll(fleetToken('token-1').hash, WORKER));
  await sql("UPDATE workers SET reachable = true, worker_admission = 'admitted'");
  await createLaunchRun(database);
});

// A card of run-1 whose task's execution was granted and then reported
// uncertain, so it waits for reconciliation.
async function unknownExecution(): Promise<{ taskId: string; attemptId: string }> {
  const placed = await placedTask(database, 'task-1', WORKER.workerId);
  const granted = value(await launchAuthority(database).authorize({ workerId: WORKER.workerId, generation: 1 }, placed.request));
  assert.equal(granted.kind, 'granted');
  value(await database.transaction(async (tx) => {
    const task = await tx.tasks.get(placed.taskId);
    if (!task.ok) return task;
    const report = { workerId: WORKER.workerId, executionId: placed.request.executionId, kind: 'uncertain' as const };
    const uncertain = recordExecutionEvidence(task.value, report, await tx.now());
    if (!uncertain.ok) return uncertain;
    const stored = await tx.tasks.replace(uncertain.value.task, task.value.generation);
    if (!stored.ok) return stored;
    return tx.cards.register({ runId: 'run-1' as never, projectId: 'project-1' as never, title: 'Card', workType: 'feature', createdAt: await tx.now() });
  }));
  return { taskId: placed.taskId, attemptId: placed.request.attemptId };
}

// Applies a worker's report to the task in its own transaction.
async function report(taskId: string, change: (task: Task, at: Instant) => Result<ObservationResult>): Promise<void> {
  value(await database.transaction(async (tx) => {
    const task = await tx.tasks.get(taskId as never);
    if (!task.ok) return task;
    const changed = change(task.value, await tx.now());
    return changed.ok ? tx.tasks.replace(changed.value.task, task.value.generation) : changed;
  }));
}

// The inbox-item-changed events since the last call: each one's project,
// or the installation, its item, and the item's state.
async function itemEvents(): Promise<[string, string, string][]> {
  const rows = await sql<{ project_id: string | null; record: string }>('DELETE FROM ui_events RETURNING project_id, record');
  return rows.map((row) => ({ scope: row.project_id ?? 'installation', record: JSON.parse(row.record).record }))
    .filter(({ record }) => record.type === 'inbox-item-changed').map(({ scope, record }) => [scope, record.item.id, record.item.state]);
}

async function count(table: string): Promise<number> {
  return (await sql<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`))[0]!.count;
}

test('an unknown execution\'s answer ends its attempt, releases its reservation, and leaves the inbox with its card touched', async () => {
  const { taskId } = await unknownExecution();
  const inbox = startInboxServices(database, SESSIONS);
  const { views } = startBoardServices(database, inbox.viewSources);
  const [open] = value(await views.open(PROJECT)).items;
  assert.deepEqual([open!.kind, open!.kind === 'reconciliation' && open!.reconciliationReason, open!.answerableBy], [
    'reconciliation', 'unknown-execution', 'project-maintainer',
  ]);
  assert.equal(value(await views.counts(PROJECT)).total, 1);
  await sql('DELETE FROM card_touches');
  await sql('DELETE FROM ui_events');
  const resolved = value(await inbox.answers.answer(PROJECT, submission(open!.id, 'key-1', RESOLVE)));
  assert.equal(resolved.state, 'resolved');
  const reason = resolved.state === 'resolved' && resolved.resolution.answer.kind === 'reconciliation' && resolved.resolution.answer.reason;
  assert.equal(reason, 'host lost, token [redacted]', 'the recorded reason is redacted');
  const task = value(await database.readOnly((tx) => tx.tasks.get(taskId as never)));
  assert.equal(task.attempts[0]!.outcome?.kind, 'operator-resolved');
  assert.deepEqual(await sql('SELECT reservation_state FROM assignments'), [{ reservation_state: 'released' }]);
  assert.deepEqual([await count('reconciliation_answers'), await count('inbox_answer_keys')], [1, 1]);
  assert.ok((await sql<{ subject: string }>('SELECT subject FROM card_touches')).some((row) => row.subject === 'task'), 'the card is touched');
  const events = await sql<{ record: string }>('SELECT record FROM ui_events');
  const changed = events.map((row) => JSON.parse(row.record).record).filter((record) => record.type === 'inbox-item-changed');
  assert.deepEqual(changed.map((record) => [record.item.id, record.item.state]), [[open!.id, 'resolved']]);
  assert.deepEqual(value(await views.open(PROJECT)).items, []);
  assert.equal(JSON.stringify(await sql('SELECT item FROM reconciliation_answers')).includes(SECRET), false);
  assert.deepEqual(value(await inbox.answers.answer(PROJECT, submission(open!.id, 'key-1', RESOLVE))), resolved);
  const reused = failed(await inbox.answers.answer(PROJECT, submission(open!.id, 'key-1', { ...RESOLVE, reason: 'other' })));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', KEY_REUSED]);
  const second = failed(await inbox.answers.answer(PROJECT, submission(open!.id, 'key-2', RESOLVE)));
  assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED]);
  assert.equal(await count('inbox_answer_keys'), 1);
});

test('a refused answer records no key or answer and keeps the reservation', async () => {
  await unknownExecution();
  const inbox = startInboxServices(database, SESSIONS);
  const [open] = value(await startBoardServices(database, inbox.viewSources).views.open(PROJECT)).items;
  assert.equal(failed(await inbox.answers.answer(PROJECT, submission(open!.id, 'key-1', acknowledge()))).code, 'invalid');
  assert.equal(failed(await inbox.answers.answer(INSTALLATION, submission(open!.id, 'key-1', RESOLVE))).code, 'not-found');
  assert.deepEqual([await count('reconciliation_answers'), await count('inbox_answer_keys')], [0, 0]);
  assert.deepEqual(await sql('SELECT reservation_state FROM assignments'), [{ reservation_state: 'held' }]);
});

// The resolver in its own transaction, as the answer's source calls it.
async function resolveIn(item: NeedsYouItem) {
  const resolution = { resolvedBy: 'person-1' as never, answer: RESOLVE };
  return database.transaction((tx) => new TransactionalReconciliationResolver(tx).resolve(item as never, resolution));
}

test('the resolver rereads the task: a newer generation is attempt-not-current, an ended execution item-closed', async () => {
  await unknownExecution();
  const { views } = startBoardServices(database, startInboxServices(database, SESSIONS).viewSources);
  const [open] = value(await views.open(PROJECT)).items;
  assert.equal(open!.subject.scope, 'card');
  const subject = open!.subject.scope === 'card' ? open!.subject : undefined;
  const newer = { ...open!, subject: { ...subject!, attemptGeneration: subject!.attemptGeneration! + 1 } } as NeedsYouItem;
  assert.equal(failed(await resolveIn(newer)).details.reason, ATTEMPT_NOT_CURRENT);
  assert.equal(await count('reconciliation_answers'), 0);
  assert.equal(value(await resolveIn(open!)).state, 'resolved');
  const ended = failed(await resolveIn(open!));
  assert.deepEqual([ended.code, ended.details.reason], ['precondition-failed', ITEM_CLOSED]);
  assert.equal(await count('reconciliation_answers'), 1);
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

// The production answers, with the key reads held by `wait`.
function racingAnswers(wait: () => Promise<void>): InboxAnswers {
  const redactor = new SecretTextRedactor();
  return new InboxAnswers({
    transaction: (work) => database.transaction((tx) => {
      const reads = boardReadsOf(tx);
      const keys: InboxAnswerKeys = {
        find: async (itemId, key) => {
          const found = await tx.inboxAnswerKeys.find(itemId, key);
          await wait();
          return found;
        },
        record: (answer) => tx.inboxAnswerKeys.record(answer),
      };
      const resolver = new TransactionalReconciliationResolver(tx);
      return work({ keys, sources: [new ReconciliationSource({ reads, positions: headPositions(reads), redactor, resolver })] });
    }),
  }, DIGEST);
}

async function processItemId(): Promise<string> {
  await sql(`INSERT INTO unrecorded_processes (worker_id, observation_id, journal_id, containment, process_count, recorded_at)
    VALUES ('worker-1', 'observation-1', 'journal-1', 'cgroup taskelith/unknown', 2, now())`);
  const [open] = value(await startBoardServices(database, startInboxServices(database, SESSIONS).viewSources).views.open(INSTALLATION)).items;
  return open!.id;
}

test('two concurrent identical answers commit one answer, and both return it', async () => {
  const itemId = await processItemId();
  const answers = racingAnswers(barrier(2));
  const [first, second] = await Promise.all([1, 2].map(() => answers.answer(INSTALLATION, submission(itemId, 'key-1', acknowledge()))));
  assert.equal(value(first!).state, 'resolved');
  assert.deepEqual(value(second!), value(first!));
  assert.deepEqual([await count('reconciliation_answers'), await count('inbox_answer_keys')], [1, 1]);
  assert.deepEqual(value(await startBoardServices(database, startInboxServices(database, SESSIONS).viewSources).views.open(INSTALLATION)).items, []);
});

test('two concurrent different answers commit one; the other is refused as a reused key or as already answered', async () => {
  for (const [other, reason] of [[submission('', 'key-1', acknowledge('another reason')), KEY_REUSED], [submission('', 'key-2', acknowledge()), ALREADY_ANSWERED]] as const) {
    await sql('TRUNCATE unrecorded_processes, inbox_answer_keys, reconciliation_answers');
    const itemId = await processItemId();
    const answers = racingAnswers(barrier(2));
    const outcomes: Result<NeedsYouItem>[] = await Promise.all([submission(itemId, 'key-1', acknowledge()), { ...other, itemId: itemId as never }]
      .map((each) => answers.answer(INSTALLATION, each)));
    const refused = outcomes.filter((outcome) => !outcome.ok);
    assert.equal(refused.length, 1, reason);
    assert.deepEqual([failed(refused[0]!).code, failed(refused[0]!).details.reason], ['conflict', reason]);
    assert.deepEqual([await count('reconciliation_answers'), await count('inbox_answer_keys')], [1, 1], reason);
  }
});

test('the projector publishes an unknown execution\'s item as it opens and as a terminal fact closes it, once each', async () => {
  const { taskId } = await unknownExecution();
  const inbox = startInboxServices(database, SESSIONS);
  const { views, projector } = startBoardServices(database, inbox.viewSources);
  const [open] = value(await views.open(PROJECT)).items;
  await sql('DELETE FROM ui_events');
  value(await projector.project());
  assert.deepEqual(await itemEvents(), [['project-1', open!.id, 'open']]);
  value(await projector.project());
  assert.deepEqual(await itemEvents(), [], 'an unchanged item is not published again');
  const exit = { workerId: WORKER.workerId, executionId: (open!.subject as { executionId: string }).executionId as never };
  await report(taskId, (task, at) => recordExit(task, { ...exit, status: { kind: 'code', code: 0 }, startProven: true, spawnFailed: false }, at));
  value(await projector.project());
  assert.deepEqual(await itemEvents(), [['project-1', open!.id, 'closed']]);
  assert.deepEqual(value(await views.open(PROJECT)).items, []);
});

test('the projector publishes an unrecorded process\'s item as it opens, and an answer\'s resolution only once', async () => {
  const itemId = await processItemId();
  const inbox = startInboxServices(database, SESSIONS);
  const { projector } = startBoardServices(database, inbox.viewSources);
  await sql('DELETE FROM ui_events');
  value(await projector.project());
  assert.deepEqual(await itemEvents(), [['installation', itemId, 'open']]);
  value(await inbox.answers.answer(INSTALLATION, submission(itemId, 'key-1', acknowledge())));
  value(await projector.project());
  assert.deepEqual(await itemEvents(), [['installation', itemId, 'resolved']]);
});

test('a closed item keeps its generation and closing time when its task changes later', async () => {
  const { taskId } = await unknownExecution();
  const inbox = startInboxServices(database, SESSIONS);
  const { views, projector } = startBoardServices(database, inbox.viewSources);
  const [open] = value(await views.open(PROJECT)).items;
  const subject = open!.subject as { executionId: string; attemptGeneration: number };
  await report(taskId, (task, at) => recordNotStarted(task, { workerId: WORKER.workerId, executionId: subject.executionId as never }, at));
  value(await projector.project());
  const item = () => inbox.answers.item(PROJECT, open!.id);
  const closed = value(await item());
  assert.equal(closed.state, 'closed');
  const later = `jsonb_set(jsonb_set(record::jsonb, '{changedAt}', '"2030-01-01T00:00:00.000Z"'), '{ownershipGeneration}', '9')`;
  await sql(`UPDATE tasks SET record = ${later}::text`);
  assert.deepEqual(value(await item()), closed);
  assert.equal((value(await item()).subject as { attemptGeneration: number }).attemptGeneration, subject.attemptGeneration);
});

test('an answered execution\'s resolution is published by its answer alone, never again by the projector', async () => {
  await unknownExecution();
  const inbox = startInboxServices(database, SESSIONS);
  const { views, projector } = startBoardServices(database, inbox.viewSources);
  const [open] = value(await views.open(PROJECT)).items;
  value(await projector.project());
  await sql('DELETE FROM ui_events');
  value(await inbox.answers.answer(PROJECT, submission(open!.id, 'key-1', RESOLVE)));
  value(await projector.project());
  value(await projector.project());
  const events = await itemEvents();
  assert.deepEqual(events, [['project-1', open!.id, 'resolved']]);
});
