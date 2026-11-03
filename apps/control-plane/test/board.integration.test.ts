import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { BoardViews, PROJECTION_BATCH, boardReadsOf, startBoardServices, type InboxSourcesIn } from '@taskelith/control-plane';
import { NoMergeQueue } from '@taskelith/integrations';
import { err, failure, ok } from '@taskelith/kernel';
import { PostgresDatabase, PostgresUiEventLog, migrate, type PostgresCrashPoint } from '@taskelith/postgres';
import { integrationEndpoint, value } from '@taskelith/testing';
import { BoardWorld, EARLY, admission, run, task } from './board-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_board_${process.pid}`;
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

beforeEach(() => sql('TRUNCATE cards, card_touches, board_projections, workflow_runs, tasks, admissions, task_lineage, workers, ui_events, projects CASCADE'));

const NO_SOURCES = () => [];
const PROJECT = `p${'a'.repeat(32)}`;

// A card of `alpha` with its run and one task in `apply`, committed alone.
async function card(runId: string): Promise<void> {
  value(await database.transaction(async (tx) => {
    value(await tx.runs.add(run(runId, { proposal: 'completed', specs: 'completed', apply: 'in-progress' })));
    value(await tx.admissions.add(admission(`task-${runId}`, 'apply')));
    value(await tx.tasks.add(task(`task-${runId}`)));
    return tx.cards.register({ runId: runId as never, projectId: 'alpha' as never, title: `Card ${runId}`, workType: 'feature', createdAt: EARLY });
  }));
  await sql(`INSERT INTO task_lineage (task_id, root_task_id, depth, project_id, run_id) VALUES ($1, $1, 0, 'alpha', $2)`, [`task-${runId}`, runId]);
}

async function cardEvents(): Promise<{ type: string; column?: string; workersOnline?: number }[]> {
  const rows = await sql<{ record: string }>('SELECT record FROM ui_events ORDER BY entry_id');
  return rows.map((row) => {
    const { record } = JSON.parse(row.record) as { record: { type: string; card?: { column: string }; workersOnline?: number } };
    return { type: record.type, ...(record.card === undefined ? {} : { column: record.card.column }), ...(record.workersOnline === undefined ? {} : { workersOnline: record.workersOnline }) };
  });
}

// The production numbering pass, READ COMMITTED.
const log = new PostgresUiEventLog(database);

// Settles once every unnumbered entry is below the numbering horizon, which
// the cluster's other test databases' transactions can hold back.
async function untilNumberable(): Promise<void> {
  const deadline = performance.now() + 20_000;
  for (;;) {
    const [row] = await sql<{ above: boolean }>(`SELECT pg_snapshot_xmin(pg_current_snapshot()) > coalesce((SELECT max(inserted_by)
      FROM ui_events WHERE position IS NULL AND inserted_by < pg_snapshot_xmax(pg_current_snapshot())), '0'::xid8) AS above`);
    if (row!.above) return;
    if (performance.now() > deadline) throw new Error('the numbering horizon did not move past the events');
    await delay(20);
  }
}

const pendingTouches = async () => (await sql<{ count: number }>('SELECT count(*)::int AS count FROM card_touches'))[0]!.count;

test('the board and the task detail read one snapshot over PostgreSQL, the head first', async () => {
  await card('run-1');
  const { views } = startBoardServices(database, NO_SOURCES);
  const board = value(await views.forCaller(true).board('alpha' as never));
  assert.deepEqual([board.position, board.cards.map((each) => [each.runId, each.column, each.session.state]), board.workersOnline], ['0', [['run-1', 'implement', 'none']], 0]);
  const detail = value(await views.forCaller(false).taskDetail('alpha' as never, 'run-1' as never));
  assert.deepEqual(detail.tasks.map((each) => [each.taskId, each.taskRunId]), [['task-run-1', 'run-1']]);
  const counts = value(await views.counts({ kind: 'project', projectId: 'alpha' as never }));
  assert.deepEqual([counts.total, counts.byCard], [0, []]);
});

// A task of run-1 admitted in its own transaction, or a delegated child.
async function admitted(taskId: string, parent?: string): Promise<void> {
  value(await database.transaction(async (tx) => {
    value(await tx.admissions.add(admission(taskId, 'apply')));
    return tx.tasks.add(task(taskId));
  }));
  await sql(`INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id) VALUES ($1, $2, $3, $4, 'alpha', $5)`,
    [taskId, parent ?? null, parent ?? taskId, parent === undefined ? 0 : 1, parent === undefined ? 'run-1' : `run-${taskId}`]);
}

test('the task detail lists the tasks in the same order over PostgreSQL as in memory, a child admitted after a later task under its parent', async () => {
  const admissions: [string, string?][] = [['task-b'], ['task-a'], ['task-b-child', 'task-b'], ['task-a-z', 'task-a'], ['task-b-later', 'task-b']];
  await card('run-1');
  for (const [taskId, parent] of admissions) await admitted(taskId, parent);
  const world = new BoardWorld();
  await world.card('run-1', 'alpha', EARLY, run('run-1', { proposal: 'completed', specs: 'completed', apply: 'in-progress' }));
  await world.addTask('run-1', task('task-run-1'), 'apply', { session: false });
  for (const [taskId, parent] of admissions) {
    await world.addTask('run-1', task(taskId), 'apply', { session: false, ...(parent === undefined ? {} : { parent, depth: 1 }) });
  }
  const order = async (views: BoardViews) => value(await views.forCaller(false).taskDetail('alpha' as never, 'run-1' as never)).tasks.map((each) => each.taskId);
  const expected = ['task-run-1', 'task-b', 'task-b-child', 'task-b-later', 'task-a', 'task-a-z'];
  assert.deepEqual(await order(startBoardServices(database, NO_SOURCES).views), expected);
  assert.deepEqual(await order(new BoardViews({ ...world.parts(), store: world.store() })), expected);
});

test('an inbox source takes its position from the head of the view snapshot', async () => {
  await card('run-1');
  value(await startBoardServices(database, NO_SOURCES).projector.project());
  await untilNumberable();
  assert.equal(value(await log.assign(10, EARLY)), 1);
  const positions: string[] = [];
  const recording: InboxSourcesIn = (_timeline, viewPositions) => [{
    id: 'native-request' as never, kinds: ['input-request'],
    openItems: async () => {
      positions.push(value(await viewPositions.current()));
      return ok({ items: [], position: positions.at(-1)! });
    },
    answer: async () => err(failure('unavailable', 'not answered here')),
  }];
  const list = value(await startBoardServices(database, recording).views.open({ kind: 'installation' }));
  assert.deepEqual([positions, list.position, list.items], [['1'], '1', []]);
});

test('a projected event is numbered only once every older transaction has ended', async () => {
  await card('run-1');
  const older = new pg.Client({ connectionString: url.href });
  await older.connect();
  try {
    await older.query('BEGIN');
    await older.query('SELECT pg_current_xact_id()');
    value(await startBoardServices(database, NO_SOURCES).projector.project());
    assert.equal(value(await log.assign(10, EARLY)), 0, 'the older transaction holds the numbering');
  } finally {
    await older.query('COMMIT');
    await older.end();
  }
  await untilNumberable();
  assert.equal(value(await log.assign(10, EARLY)), 1);
});

test('a card committed after a view read its head stays out of that view', async () => {
  await card('run-1');
  const store = {
    snapshot: <Value>(work: (reads: ReturnType<typeof boardReadsOf>) => Promise<import('@taskelith/kernel').Result<Value>>) => database.readOnly(async (tx) => {
      const reads = boardReadsOf(tx);
      value(await reads.head());
      await card('run-2');
      return work(reads);
    }),
  };
  const views = new BoardViews({ store, mergeQueue: new NoMergeQueue(), sources: NO_SOURCES });
  const board = value(await views.forCaller(true).board('alpha' as never));
  assert.deepEqual(board.cards.map((each) => each.runId), ['run-1']);
  const later = value(await startBoardServices(database, NO_SOURCES).views.forCaller(true).board('alpha' as never));
  assert.deepEqual(later.cards.map((each) => each.runId), ['run-1', 'run-2']);
});

test('the projector appends a card-changed per changed card once, and a board-changed when the workers online change', async () => {
  await sql(`INSERT INTO projects (project_id, name, created_at, revision) VALUES ($1, 'Alpha', now(), 1)`, [PROJECT]);
  await card('run-1');
  const { projector } = startBoardServices(database, NO_SOURCES);
  assert.ok(value(await projector.project()).touches > 0);
  assert.deepEqual(await cardEvents(), [{ type: 'card-changed', column: 'implement' }]);
  assert.equal(await pendingTouches(), 0);
  await sql("UPDATE tasks SET generation = generation WHERE id = 'task-run-1'");
  value(await projector.project());
  assert.deepEqual(await cardEvents(), [{ type: 'card-changed', column: 'implement' }], 'an unchanged card appends nothing');
  value(await database.transaction(async (tx) => {
    const stored = value(await tx.runs.get('run-1' as never));
    const next = run('run-1', { proposal: 'completed', specs: 'completed', apply: 'completed' });
    return tx.runs.replace({ ...next, progress: { ...next.progress, generation: 2 } } as never, stored.progress.generation);
  }));
  await sql(`INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores, memory_mebibytes, controls, enrollment)
    VALUES ('w-1', true, false, false, true, 1, 1000, 1024, '{}', '{}')`);
  value(await projector.project());
  const events = await cardEvents();
  assert.deepEqual(events.slice(1).map((each) => each.type).sort(), ['board-changed', 'card-changed']);
  assert.deepEqual(events.find((each) => each.type === 'board-changed'), { type: 'board-changed', workersOnline: 1 });
  await sql("UPDATE workers SET draining = true WHERE worker_id = 'w-1'");
  value(await projector.project());
  assert.equal((await cardEvents()).length, 3, 'a worker change that keeps the count online appends no board-changed');
  await sql("UPDATE workers SET reachable = false WHERE worker_id = 'w-1'");
  value(await projector.project());
  assert.deepEqual((await cardEvents()).at(-1), { type: 'board-changed', workersOnline: 0 });
});

const pendingSubjects = async () => (await sql<{ touch: string }>("SELECT subject || ':' || subject_id AS touch FROM card_touches ORDER BY touch_id")).map((row) => row.touch);

test('a card whose read fails keeps its touch while the other cards emit, and emits once repaired', async () => {
  await card('run-1');
  value(await database.transaction((tx) => tx.cards.register({ runId: 'run-2' as never, projectId: 'alpha' as never, title: 'Card run-2', workType: 'feature', createdAt: EARLY })));
  const { projector } = startBoardServices(database, NO_SOURCES);
  const pass = value(await projector.project());
  assert.deepEqual([await cardEvents(), pass.skipped], [[{ type: 'card-changed', column: 'implement' }], ['run-2']], 'a run is missing');
  assert.deepEqual(await pendingSubjects(), ['run:run-2'], 'the unreadable card stays touched');
  assert.deepEqual(value(await projector.project()).skipped, ['run-2']);
  value(await database.transaction((tx) => tx.runs.add(run('run-2', { proposal: 'in-progress' }))));
  assert.deepEqual(value(await projector.project()).skipped, []);
  assert.deepEqual((await cardEvents()).map((each) => each.column), ['implement', 'propose']);
  assert.equal(await pendingTouches(), 0);
});

// The process dies at the crash point: a hook that throws stands in for it,
// and a new pool over the same database for the restart.
function crashingAt(point: PostgresCrashPoint, reach = 1): PostgresDatabase {
  let reached = 0;
  const crash = (at: PostgresCrashPoint) => {
    if (at === point && ++reached === reach) throw new Error(`crashed at ${point}`);
  };
  return new PostgresDatabase(url, { crashPoints: { reach: crash } });
}

for (const [point, eventsAfterCrash, touchesAfterCrash] of [['CardProjectionCommit.before', 0, 1], ['CardProjectionCommit.after', 1, 0]] as const) {
  test(`a projection that crashes at ${point} leaves the touch or its event, and the restart appends the event once`, async () => {
    await card('run-1');
    value(await startBoardServices(database, NO_SOURCES).projector.project());
    await sql("UPDATE cards SET projection = NULL WHERE run_id = 'run-1'");
    await sql('TRUNCATE ui_events');
    await sql("UPDATE tasks SET generation = generation WHERE id = 'task-run-1'");
    assert.equal(await pendingTouches(), 1, 'the writer committed its touch');
    const crashing = crashingAt(point);
    await assert.rejects(startBoardServices(crashing, NO_SOURCES).projector.project(), new RegExp(`crashed at ${point}`));
    await crashing.close();
    assert.deepEqual([(await cardEvents()).length, await pendingTouches()], [eventsAfterCrash, touchesAfterCrash]);
    const restarted = new PostgresDatabase(url);
    try {
      value(await startBoardServices(restarted, NO_SOURCES).projector.project());
    } finally {
      await restarted.close();
    }
    assert.deepEqual([await cardEvents(), await pendingTouches()], [[{ type: 'card-changed', column: 'implement' }], 0]);
  });
}

// A fleet touch over more cards than a batch: the expansion commits first,
// then each batch, so the second reach of the point is the first batch.
for (const [point, eventsAfterCrash, touchesAfterCrash] of [['CardProjectionCommit.before', 0, PROJECTION_BATCH + 1], ['CardProjectionCommit.after', PROJECTION_BATCH, 1]] as const) {
  test(`a fleet projection that crashes at ${point} of its first batch loses and repeats no event of the batches`, async () => {
    const runIds = Array.from({ length: PROJECTION_BATCH + 1 }, (_, index) => `run-${String(index).padStart(3, '0')}`);
    for (const runId of runIds) await card(runId);
    value(await startBoardServices(database, NO_SOURCES).projector.project());
    await sql('UPDATE cards SET projection = NULL');
    await sql('TRUNCATE ui_events');
    await sql("INSERT INTO card_touches (subject, subject_id) VALUES ('fleet', 'installation')");
    const crashing = crashingAt(point, 2);
    await assert.rejects(startBoardServices(crashing, NO_SOURCES).projector.project(), new RegExp(`crashed at ${point}`));
    await crashing.close();
    assert.deepEqual([(await cardEvents()).length, await pendingTouches()], [eventsAfterCrash, touchesAfterCrash]);
    const restarted = new PostgresDatabase(url);
    try {
      value(await startBoardServices(restarted, NO_SOURCES).projector.project());
    } finally {
      await restarted.close();
    }
    const appended = await sql<{ run_id: string }>("SELECT record::jsonb #>> '{record,card,runId}' AS run_id FROM ui_events ORDER BY entry_id");
    assert.deepEqual([appended.map((row) => row.run_id).sort(), await pendingTouches()], [runIds, 0]);
  });
}

test('a view whose store cannot be read fails, never with a partial view', async () => {
  const views = new BoardViews({ store: { snapshot: async () => err(failure('unavailable', 'PostgreSQL is not reachable')) }, mergeQueue: new NoMergeQueue(), sources: NO_SOURCES });
  const board = await views.forCaller(true).board('alpha' as never);
  assert.equal(board.ok || board.error.code, 'unavailable');
  assert.equal(ok(1).ok, true);
});
