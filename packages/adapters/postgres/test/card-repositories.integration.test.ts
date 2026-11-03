import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { CARD_CATALOG_CONFORMANCE, type CardCatalog } from '@taskelith/execution';
import { PostgresDatabase } from '@taskelith/postgres';
import { value } from '@taskelith/testing';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());
beforeEach(() => truncateAll(url));

// Each call commits alone, as the conformance cases expect.
const catalog: CardCatalog = {
  register: (card) => database.transaction((tx) => tx.cards.register(card)),
  get: (runId) => database.readOnly((tx) => tx.cards.get(runId)),
  listByProject: (projectId) => database.readOnly((tx) => tx.cards.listByProject(projectId)),
};

for (const conformance of CARD_CATALOG_CONFORMANCE) {
  test(`PostgreSQL card catalog: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(catalog), []);
  });
}

const AT = '2026-11-03T08:00:00.000Z';

async function touches(): Promise<string[]> {
  const rows = await query<{ subject: string; subject_id: string }>(url, 'SELECT subject, subject_id FROM card_touches ORDER BY touch_id');
  return rows.map((row) => `${row.subject}:${row.subject_id}`);
}

async function lineage(taskId: string, runId: string, root = taskId, depth = 0, parent = root): Promise<void> {
  await query(url, `INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id)
    VALUES ($1, $2, $3, $4, 'alpha', $5)`, [taskId, depth === 0 ? null : parent, root, depth, runId]);
}

// Opens each task in its own transaction, in the order given.
async function admit(...taskIds: string[]): Promise<void> {
  for (const taskId of taskIds) {
    await query(url, "INSERT INTO tasks (id, admission_id, generation, record) VALUES ($1, $2, 1, '{}')", [taskId, `adm-${taskId}`]);
  }
}

async function card(runId: string, projectId = 'alpha'): Promise<void> {
  value(await catalog.register({ runId: runId as never, projectId: projectId as never, title: `Card ${runId}`, workType: 'bug', createdAt: AT as never }));
}

test('the database refuses a title past 200 characters or with a control character, and an unknown work type', async () => {
  const insert = (title: string, workType = 'bug') => query(url, `INSERT INTO cards (run_id, project_id, title, work_type, created_at)
    VALUES ('run-x', 'alpha', $1, $2, now())`, [title, workType]);
  await assert.rejects(insert('x'.repeat(201)), /cards_title_check/);
  await assert.rejects(insert('a\tb'), /cards_title_check/);
  await assert.rejects(insert(''), /cards_title_check/);
  await assert.rejects(insert('ok', 'chore'), /cards_work_type_check/);
  await insert('é'.repeat(200));
});

test('each writer of a card input touches its run, task, session, project, or worker in its own transaction', async () => {
  await card('run-1');
  await query(url, "INSERT INTO workflow_runs (id, generation, record, project_id) VALUES ('run-1', 1, '{}', 'alpha')");
  await query(url, "INSERT INTO gates (id, run_id, generation, record) VALUES ('g-1', 'run-1', 1, '{}')");
  await lineage('task-1', 'run-1');
  await query(url, "INSERT INTO tasks (id, admission_id, generation, record) VALUES ('task-1', 'adm-1', 1, '{}')");
  await query(url, "INSERT INTO placement_outcomes (task_id, disposition, reason, source, recorded_at) VALUES ('task-1', 'waiting', 'no-candidate', 'scheduler', now())");
  await query(url, "DELETE FROM placement_outcomes WHERE task_id = 'task-1'");
  await query(url, "INSERT INTO agent_sessions (session_id, task_id, version, record) VALUES ('s-1', 'task-1', 1, '{}')");
  await query(url, `INSERT INTO session_inbox_items (item_id, session_id, kind, generation, native_request_id, state, record)
    VALUES ('i-1', 's-1', 'permission-request', 1, 'n-1', 'open', '{}')`);
  assert.deepEqual(await touches(), [
    'run:run-1', 'run:run-1', 'run:run-1', 'task:task-1', 'task:task-1', 'task:task-1', 'task:task-1', 'task:task-1', 'session:s-1',
  ]);
  await query(url, 'TRUNCATE card_touches');
  await query(url, "BEGIN; INSERT INTO gates (id, run_id, generation, record) VALUES ('g-2', 'run-1', 1, '{}'); ROLLBACK");
  await assert.rejects(query(url, "INSERT INTO gates (id, run_id, generation, record) VALUES ('g-1', 'run-1', 1, '{}')"), /gates_pkey/);
  assert.deepEqual(await touches(), [], 'a rolled-back write leaves no touch');
});

test('a worker touches only when more than its contact time changes, and the auto-merge setting touches its project', async () => {
  await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores, memory_mebibytes, controls)
    VALUES ('w-1', true, false, false, true, 1, 1000, 1024, '{}')`);
  await query(url, "UPDATE workers SET last_contact_at = now() WHERE worker_id = 'w-1'");
  await query(url, "UPDATE workers SET reachable = false WHERE worker_id = 'w-1'");
  await query(url, "INSERT INTO projects (project_id, name, created_at, revision) VALUES ($1, 'Alpha', now(), 1)", [`p${'a'.repeat(32)}`]);
  await query(url, 'INSERT INTO auto_merge_settings (project_id, enabled, revision) VALUES ($1, true, 1)', [`p${'a'.repeat(32)}`]);
  assert.deepEqual(await touches(), ['worker:w-1', 'worker:w-1', `project:p${'a'.repeat(32)}`]);
});

test('taking touches removes them and names each card once, through its lineage, sessions, project, or every card for a worker', async () => {
  await card('run-1');
  await card('run-2');
  await card('run-3', 'beta');
  await lineage('task-1', 'run-1');
  await lineage('task-child', 'run-child', 'task-1', 1);
  await query(url, "INSERT INTO agent_sessions (session_id, task_id, version, record) VALUES ('s-2', 'task-child', 1, '{}')");
  await admit('task-1', 'task-child');
  await query(url, 'TRUNCATE card_touches');
  const take = () => database.transaction((tx) => tx.cardProjections.take(100));
  await query(url, "INSERT INTO card_touches (subject, subject_id) VALUES ('run', 'run-child'), ('session', 's-2'), ('run', 'run-unknown')");
  assert.deepEqual(await take(), { ok: true, value: { touches: 3, runIds: ['run-1'], workersChanged: false } });
  assert.deepEqual(await touches(), []);
  await query(url, "INSERT INTO card_touches (subject, subject_id) VALUES ('project', 'beta'), ('task', 'task-1')");
  assert.deepEqual(await take(), { ok: true, value: { touches: 2, runIds: ['run-1', 'run-3'], workersChanged: false } });
  await query(url, "INSERT INTO card_touches (subject, subject_id) VALUES ('worker', 'w-1')");
  assert.deepEqual(await take(), { ok: true, value: { touches: 1, runIds: ['run-1', 'run-2', 'run-3'], workersChanged: true } });
  assert.deepEqual(value(await database.readOnly((tx) => tx.cards.tasks('run-1' as never))), [
    { taskId: 'task-1', taskRunId: 'run-1', depth: 0 }, { taskId: 'task-child', taskRunId: 'run-child', parentTaskId: 'task-1', depth: 1 },
  ]);
});

test('the projections keep each card\'s last event and each board\'s workers online', async () => {
  await card('run-1');
  await query(url, "INSERT INTO projects (project_id, name, created_at, revision) VALUES ($1, 'Beta', now(), 1), ($2, 'Alpha', now(), 1)", [`p${'b'.repeat(32)}`, `p${'a'.repeat(32)}`]);
  const read = await database.transaction(async (tx) => {
    const before = value(await tx.cardProjections.lastCard('run-1' as never));
    value(await tx.cardProjections.recordCard('run-1' as never, '{"card":1}'));
    value(await tx.cardProjections.recordWorkersOnline('alpha' as never, 2));
    value(await tx.cardProjections.recordWorkersOnline('alpha' as never, 3));
    return { ok: true, value: { before, projects: value(await tx.cardProjections.projectIds()) } } as const;
  });
  assert.deepEqual(read, { ok: true, value: { before: undefined, projects: [`p${'a'.repeat(32)}`, `p${'b'.repeat(32)}`] } });
  assert.deepEqual(await database.readOnly(async (tx) => tx.cardProjections.lastCard('run-1' as never)), { ok: true, value: '{"card":1}' });
  assert.deepEqual(await database.readOnly(async (tx) => tx.cardProjections.lastWorkersOnline('alpha' as never)), { ok: true, value: 3 });
  assert.deepEqual(await database.readOnly(async (tx) => tx.cardProjections.lastWorkersOnline('beta' as never)), { ok: true, value: undefined });
});

const take = () => database.transaction((tx) => tx.cardProjections.take(100));

async function twoWaitingCards(): Promise<void> {
  await card('run-1');
  await card('run-2');
  await lineage('task-1', 'run-1');
  await lineage('task-2', 'run-2');
  await query(url, 'TRUNCATE card_touches');
}

test('a reservation held or released on a worker touches every card, whose fleet obstacle it can change', async () => {
  await twoWaitingCards();
  await query(url, `INSERT INTO assignments (id, attempt_id, worker_id, reservation_state, generation, record,
    project_id, run_id, task_id, root_task_id, cpu_millicores, memory_mebibytes, state, changed_at)
    VALUES ('as-1', 'att-1', 'w-1', 'held', 1, '{}', 'alpha', 'run-1', 'task-1', 'task-1', 1000, 1024, 'offered', now())`);
  assert.deepEqual(await take(), { ok: true, value: { touches: 2, runIds: ['run-1', 'run-2'], workersChanged: false } });
  await query(url, "UPDATE assignments SET reservation_state = 'released' WHERE id = 'as-1'");
  assert.deepEqual(await take(), { ok: true, value: { touches: 2, runIds: ['run-1', 'run-2'], workersChanged: false } });
  await query(url, "UPDATE assignments SET generation = 2 WHERE id = 'as-1'");
  assert.deepEqual(await take(), { ok: true, value: { touches: 1, runIds: ['run-1'], workersChanged: false } }, 'the occupancy stayed');
});

test('an admission write touches the cards of the tasks it admits', async () => {
  await twoWaitingCards();
  await query(url, "INSERT INTO tasks (id, admission_id, generation, record) VALUES ('task-1', 'adm-1', 1, '{}')");
  await query(url, 'TRUNCATE card_touches');
  await query(url, "INSERT INTO admissions (id, generation, state, artifact_ids, record) VALUES ('adm-1', 1, 'admitted', '{}', '{}')");
  await query(url, "UPDATE admissions SET generation = 2, state = 'used' WHERE id = 'adm-1'");
  assert.deepEqual(await touches(), ['admission:adm-1', 'admission:adm-1']);
  assert.deepEqual(await take(), { ok: true, value: { touches: 2, runIds: ['run-1'], workersChanged: false } });
});

test('a change of the installation quarantine or recovery epoch touches every card, and of its identity none', async () => {
  await twoWaitingCards();
  await query(url, 'INSERT INTO installation (quarantined) VALUES (true)');
  await query(url, 'UPDATE installation SET quarantined = false');
  await query(url, 'UPDATE installation SET recovery_epoch = 1');
  await query(url, "UPDATE installation SET installation_id = 'inst-1'");
  assert.deepEqual(await touches(), ['fleet:installation', 'fleet:installation', 'fleet:installation']);
  assert.deepEqual(await take(), { ok: true, value: { touches: 3, runIds: ['run-1', 'run-2'], workersChanged: false } });
});

test('a card lists its tasks in admission order, each delegated child under its parent', async () => {
  await card('run-1');
  await lineage('task-b', 'run-1');
  await lineage('task-a', 'run-1');
  await lineage('task-a-z', 'run-a-z', 'task-a', 1);
  await lineage('task-b-child', 'run-b-child', 'task-b', 1);
  await lineage('task-a-z-child', 'run-a-z-child', 'task-a', 2, 'task-a-z');
  await lineage('task-a-y', 'run-a-y', 'task-a', 1);
  await admit('task-b', 'task-a', 'task-a-z', 'task-b-child', 'task-a-z-child', 'task-a-y');
  const tasks = value(await database.readOnly((tx) => tx.cards.tasks('run-1' as never)));
  assert.deepEqual(tasks.map((each) => each.taskId), ['task-b', 'task-b-child', 'task-a', 'task-a-z', 'task-a-z-child', 'task-a-y']);
});
