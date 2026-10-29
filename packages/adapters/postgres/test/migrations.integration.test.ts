import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { endAttempt, openTask, recordExecutionEvidence } from '@taskelith/execution';
import { fleetWorker } from '@taskelith/fleet';
import { MIGRATIONS_DIRECTORY, PostgresDatabase, migrate } from '@taskelith/postgres';
import { value } from '@taskelith/testing';
import { authorizedUnder, placedTask, usedAdmission } from './capacity-fixtures.ts';
import { AT, assignment } from './fixtures.ts';
import { SERVER_URL, createTestDatabase, databaseUrl, query } from './test-database.ts';

const INITIAL = '1792929600000_initial-state';
const RESOURCE_ADMISSION = '1792930000000_resource-admission';
const OBSERVABILITY_SIGNALS = '1792930400000_observability-signals';
const ENROLLMENT = '1792930800000_installation-and-enrollment';
const CONTROL_PLANE_API = '1792931200000_control-plane-api';
const WORKER_BEARER = '1792931600000_worker-bearer-authentication';
const EVIDENCE_STORE = '1792931700000_evidence-store';
const LAUNCH_AUTHORITY = '1792932000000_launch-authority';
const EXECUTION_PLACEMENT = '1792932100000_execution-placement';
const OBSERVATION_CONSUMPTION = '1792932200000_observation-consumption';
const INVENTORY_RECONCILIATION = '1792932300000_inventory-reconciliation';
const LAUNCH_RECONCILIATION = '1792932400000_launch-reconciliation';
const PLACEMENT_ROTATION = '1792932500000_placement-rotation';
const PLACEMENT_OUTCOMES = '1792932600000_placement-outcomes';
const WORKER_ADMISSION = '1792932700000_worker-admission';
const OPERATOR_ACCESS = '1792932800000_operator-access';
const ACCOUNT_POOL = '1792932900000_account-pool';
const SESSION_TIMELINE = '1792933000000_session-timeline';
const SESSION_INBOX_ITEMS = '1792933100000_session-inbox-items';
const SESSION_OUTPUT_TAIL = '1792933200000_session-output-tail';

async function copiedMigrations(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'taskelith-migrations-'));
  await cp(MIGRATIONS_DIRECTORY, directory, { recursive: true });
  test.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('migrations apply once, record their checksums, and create the schema', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.deepEqual(await migrate(url), { ok: true, value: [INITIAL, RESOURCE_ADMISSION, OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, EVIDENCE_STORE, LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  assert.deepEqual(await migrate(url), { ok: true, value: [] });
  const checksums = await query<{ name: string; sha256: string }>(url, 'SELECT name, sha256 FROM schema_migration_checksums');
  assert.deepEqual(checksums.map((row) => row.name).sort(), [INITIAL, RESOURCE_ADMISSION, OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, EVIDENCE_STORE, LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL]);
  assert.match(checksums[0]!.sha256, /^[0-9a-f]{64}$/);
  const tables = await query<{ table_name: string }>(
    url, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  assert.deepEqual(tables.map((row) => row.table_name), [
    'access_audit_events', 'account_slots', 'admissions', 'agent_session_attempts', 'agent_session_output', 'agent_session_output_tails', 'agent_sessions', 'assignments', 'audit_events', 'broker_revocations', 'browser_sessions',
    'capacity_charges', 'capacity_quotas', 'current_revisions', 'delegation_requests', 'delegations', 'enrollment_tokens',
    'evidence', 'gates', 'inbox', 'installation', 'installation_roles', 'inventory_report_parts', 'inventory_requests',
    'launch_authorizations', 'launch_rejections', 'operator_credentials', 'operator_principal', 'outbox', 'placement_outcomes',
    'placement_rotation', 'principals', 'producer_cursors', 'project_roles', 'schema_migration_checksums', 'schema_migrations', 'session_audit_events', 'session_idempotency_keys', 'session_inbox_items',
    'slot_credential_counters', 'slot_credentials', 'task_lineage', 'tasks', 'unrecorded_processes', 'worker_self_check_results', 'workers', 'workflow_runs',
  ]);
});

test('the signals migration copies the state, change time, and unknown executions of stored records', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  // The signals migration and every later one wait, so they apply in order.
  const held = [OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, EVIDENCE_STORE, LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const contents = await Promise.all(held.map((path) => readFile(path, 'utf8')));
  await Promise.all(held.map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  const offered = assignment('assignment-1');
  await query(url, `INSERT INTO assignments (id, attempt_id, worker_id, reservation_state, generation, record, project_id, run_id,
    task_id, root_task_id, cpu_millicores, memory_mebibytes) VALUES ($1, $2, $3, 'held', 1, $4, 'p', 'r', 't', 't', 500, 512)`,
  [offered.id, offered.attemptId, offered.workerId, JSON.stringify(offered)]);
  const placed = placedTask('task-1', 'attempt-1');
  const authorized = authorizedUnder(placed, offered.id, offered.workerId);
  const report = { workerId: offered.workerId, executionId: authorized.attempts[0]!.executions[0]!.id };
  const uncertain = value(recordExecutionEvidence(authorized, { ...report, kind: 'uncertain' }, AT)).task;
  // jsonb rejects the escapes of a lone surrogate and NUL, which a stored
  // reference may hold; an escaped backslash before `u` is no escape.
  const probe = 'spec\uD800.md \u0000 \\ud800';
  for (const task of [placed, uncertain]) {
    await query(url, 'INSERT INTO tasks (id, admission_id, generation, record) VALUES ($1, $2, 1, $3)',
      [`${task.id}-${task.generation}`, task.admissionId, JSON.stringify({ ...task, probe })]);
  }
  await Promise.all(held.map((path, index) => writeFile(path, contents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, EVIDENCE_STORE, LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  const [row] = await query<{ state: string; changed_at: Date }>(url, 'SELECT state, changed_at FROM assignments');
  assert.deepEqual([row!.state, row!.changed_at.toISOString()], ['offered', AT]);
  const tasks = await query<{ unknown_executions: number }>(url, 'SELECT unknown_executions FROM tasks ORDER BY unknown_executions');
  assert.deepEqual(tasks.map((task) => task.unknown_executions), [0, 1]);
});

test('the bearer migration copies the control-plane hashes of enrolled workers', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  // The bearer migration and every later one wait, so they apply in order.
  const held = [WORKER_BEARER, EVIDENCE_STORE, LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const contents = await Promise.all(held.map((path) => readFile(path, 'utf8')));
  await Promise.all(held.map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  const current = fleetWorker('w1', 'j1', { host: { platform: 'linux', architecture: 'x64', hostname: 'build\uD800 \u0000 " \\u0041' } });
  const previous = { ...current.credentials.current, generation: 1, controlPlaneHash: 'cp-old', validUntil: AT };
  const rotated = { ...fleetWorker('w2', 'j2'), credentials: { current: { ...current.credentials.current, controlPlaneHash: 'cp-new' }, previous } };
  const revoked = { ...fleetWorker('w3', 'j3'), revokedAt: AT };
  for (const worker of [current, rotated, revoked]) {
    await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores, memory_mebibytes,
      controls, journal_id, enrollment, predecessor_valid_until) VALUES ($1, true, $2, false, false, 1, 1, 1, '{}', $3, $4, $5)`,
    [worker.workerId, 'revokedAt' in worker, worker.journalId, JSON.stringify(worker), worker.credentials.previous?.validUntil ?? null]);
  }
  await Promise.all(held.map((path, index) => writeFile(path, contents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [WORKER_BEARER, EVIDENCE_STORE, LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  const rows = await query<{ control_plane_hash: string; previous_control_plane_hash: string | null; enrollment: string }>(
    url, 'SELECT control_plane_hash, previous_control_plane_hash, enrollment FROM workers ORDER BY worker_id',
  );
  assert.deepEqual(rows.map((row) => [row.control_plane_hash, row.previous_control_plane_hash]), [
    ['cp-w1-1', null], ['cp-new', 'cp-old'], ['cp-w3-1', null],
  ]);
  assert.equal(rows[0]!.enrollment, JSON.stringify(current), 'the record itself is unchanged');
});

test('the launch migration indexes the grants of stored task records', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  // The placement migration waits too, so they apply in order.
  const held = [LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const contents = await Promise.all(held.map((path) => readFile(path, 'utf8')));
  await Promise.all(held.map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  const offered = assignment('assignment-1');
  const authorized = authorizedUnder(placedTask('task-1', 'attempt-1'), offered.id, offered.workerId);
  const grant = authorized.attempts[0]!.executions[0]!.grants[0]!;
  // An identifier may hold a backslash or a quote, which the mask keeps.
  const artifact = { artifactId: 'spec\\"1', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'spec\uD800.md' };
  const stored = JSON.parse(JSON.stringify(authorized));
  stored.attempts[0].executions[0].grants[0].artifacts = [artifact];
  await query(url, 'INSERT INTO tasks (id, admission_id, generation, record) VALUES ($1, $2, 1, $3)',
    [authorized.id, authorized.admissionId, JSON.stringify({ ...stored, probe: 'spec\uD800.md \u0000 \\ud800' })]);
  const used = { ...JSON.parse(JSON.stringify(usedAdmission('task-1'))), artifacts: [artifact, { ...artifact, artifactId: 'design' }] };
  const later = { ...used, id: 'admission-z-later', artifacts: [{ ...artifact, digest: `sha256:${'bb'.repeat(32)}` }] };
  for (const admission of [used, later]) {
    await query(url, `INSERT INTO admissions (id, generation, state, artifact_ids, record, run_id) VALUES ($1, 1, 'used', '{}', $2, 'run-1')`,
      [admission.id, JSON.stringify(admission)]);
  }
  await Promise.all(held.map((path, index) => writeFile(path, contents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [LAUNCH_AUTHORITY, EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  const rows = await query(url, `SELECT launch_auth_id, worker_id, operation_id, task_id, attempt_id, assignment_id, execution_id,
    run_id, relied_on_gates, artifact_ids, live FROM launch_authorizations`);
  assert.deepEqual(rows, [{
    launch_auth_id: grant.launchAuthId, worker_id: grant.workerId, operation_id: grant.operationId, task_id: authorized.id,
    attempt_id: grant.attemptId, assignment_id: grant.assignmentId, execution_id: grant.executionId, run_id: null,
    relied_on_gates: [...grant.reliedOnGates], artifact_ids: [artifact.artifactId], live: true,
  }]);
  const revisions = await query<{ artifact_id: string; revision: string }>(url, 'SELECT artifact_id, revision FROM current_revisions ORDER BY artifact_id');
  assert.deepEqual(revisions.map((row) => [row.artifact_id, JSON.parse(row.revision).digest]), [
    ['design', artifact.digest], [artifact.artifactId, artifact.digest],
  ], 'the first used admission of the run seeds each artifact');
});

test('the placement migration derives the queue columns of stored tasks', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  const held = [EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const contents = await Promise.all(held.map((path) => readFile(path, 'utf8')));
  await Promise.all(held.map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  const offered = assignment('assignment-1');
  const ending = placedTask('task-ended', 'attempt-3');
  const tasks = [
    value(openTask(usedAdmission('task-fresh'), AT)),
    placedTask('task-placed', 'attempt\\1'),
    authorizedUnder(placedTask('task-running', 'attempt-2'), offered.id, offered.workerId),
    value(endAttempt(ending, ending.attempts[0]!.id, AT)),
  ];
  // Escapes that jsonb rejects, and an escaped backslash before `u`.
  const probe = 'spec\uD800.md \u0000 \\ud800';
  for (const task of tasks) {
    await query(url, 'INSERT INTO tasks (id, admission_id, generation, record) VALUES ($1, $2, 1, $3)',
      [task.id, task.admissionId, JSON.stringify({ ...task, probe })]);
  }
  await Promise.all(held.map((path, index) => writeFile(path, contents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [EXECUTION_PLACEMENT, OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  const rows = await query<{ id: string; awaits_placement: boolean; active_attempt_id: string | null; placement_waiting_since: Date | null }>(
    url, 'SELECT id, awaits_placement, active_attempt_id, placement_waiting_since FROM tasks ORDER BY id',
  );
  assert.deepEqual(rows.map((row) => [row.id, row.awaits_placement, row.active_attempt_id, row.placement_waiting_since?.toISOString() ?? null]), [
    ['task-ended', false, null, null],
    ['task-fresh', true, null, AT],
    ['task-placed', true, 'attempt\\1', AT],
    ['task-running', false, 'attempt-2', null],
  ]);
});

test('the observation migration finds each offered assignment\'s command in the outbox', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  const held = join(directory, `${OBSERVATION_CONSUMPTION}.sql`);
  const later = [INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const [content, ...laterContents] = await Promise.all([held, ...later].map((path) => readFile(path, 'utf8')));
  await Promise.all([held, ...later].map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  // A backslash, the text of an escape that jsonb rejects, and quotes; the
  // last assignment's offer left the outbox.
  const ids = ['assignment\\1', 'assignment\\u0000', 'assignment"2"', 'assignment-3'];
  for (const offered of ids.map((id) => assignment(id))) {
    await query(url, `INSERT INTO assignments (id, attempt_id, worker_id, reservation_state, generation, record, project_id, run_id,
      task_id, root_task_id, cpu_millicores, memory_mebibytes, state, changed_at) VALUES ($1, $2, $3, 'held', 1, $4, 'p', 'r', 't', 't', 500, 512, 'offered', $5)`,
    [offered.id, `${offered.attemptId}-${offered.id}`, offered.workerId, JSON.stringify(offered), AT]);
  }
  // Each offer's payload also holds escapes that jsonb rejects.
  for (const [index, assignmentId] of ids.slice(0, 3).entries()) {
    const offer = { metadata: { eventId: `offer-${index}` }, payload: { metadata: { note: '\u0000 \uD800' }, payload: { assignmentId } } };
    await query(url, "INSERT INTO outbox (event_id, event_type, message) VALUES ($1, 'execution.assignment.offer', $2)", [`offer-${index}`, JSON.stringify(offer)]);
  }
  await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores, memory_mebibytes, controls)
    VALUES ('worker-1', true, false, false, false, 2, 1000, 1024, '{}')`);
  await writeFile(held, content!);
  await Promise.all(later.map((path, index) => writeFile(path, laterContents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [OBSERVATION_CONSUMPTION, INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  const rows = await query<{ id: string; offer_command_id: string | null }>(url, 'SELECT id, offer_command_id FROM assignments');
  assert.deepEqual(new Map(rows.map((row) => [row.id, row.offer_command_id])), new Map([
    ['assignment\\1', 'offer-0'], ['assignment\\u0000', 'offer-1'], ['assignment"2"', 'offer-2'], ['assignment-3', null],
  ]));
  const [worker] = await query(url, `SELECT last_contact_at, capacity_sequence, pressure_sequence, capacity_refused_since,
    capacity_refusal_sequence, protocol_sequence FROM workers`);
  assert.deepEqual(worker, {
    last_contact_at: null, capacity_sequence: '0', pressure_sequence: '0', capacity_refused_since: null, capacity_refusal_sequence: '0', protocol_sequence: '0',
  });
});

test('a later migration file is applied after the applied ones', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  assert.equal((await migrate(url, directory)).ok, true);
  await writeFile(join(directory, '1792990000000_add-note.sql'), '-- Up Migration\nCREATE TABLE note (id int);\n-- Down Migration\nDROP TABLE note;\n');
  assert.deepEqual(await migrate(url, directory), { ok: true, value: ['1792990000000_add-note'] });
});

test('an edited or deleted applied migration stops the run before anything is applied', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  assert.equal((await migrate(url, directory)).ok, true);
  const file = join(directory, `${INITIAL}.sql`);
  await writeFile(file, '-- Up Migration\nSELECT 1;\n');
  await writeFile(join(directory, '1792990000000_add-note.sql'), '-- Up Migration\nCREATE TABLE note (id int);\n');
  const edited = await migrate(url, directory);
  assert.equal(!edited.ok && edited.error.code, 'precondition-failed');
  assert.equal(!edited.ok && edited.error.details.migrations, INITIAL);
  await unlink(file);
  const deleted = await migrate(url, directory);
  assert.equal(!deleted.ok && deleted.error.code, 'precondition-failed');
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name = 'note'"), []);
});

// A run that fails after applying earlier files still checked them: their
// checksums were recorded before anything ran.
test('an applied migration of an interrupted run is checked by the next run', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE broken (;\n');
  const interrupted = await migrate(url, directory);
  assert.equal(!interrupted.ok && interrupted.error.code, 'internal');
  await writeFile(join(directory, `${INITIAL}.sql`), '-- Up Migration\nSELECT 1;\n');
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE fixed (id int);\n');
  const edited = await migrate(url, directory);
  assert.equal(!edited.ok && edited.error.code, 'precondition-failed');
  assert.equal(!edited.ok && edited.error.details.migrations, INITIAL);
});

// The server clock may step back between two migration transactions, as a
// virtual machine's clock does when it is corrected.
async function stepClockBack(url: URL): Promise<void> {
  await query(url, `UPDATE schema_migrations SET run_on = (SELECT run_on FROM schema_migrations WHERE name = $1)
    - interval '1 millisecond' WHERE name = $2`, [RESOURCE_ADMISSION, OBSERVABILITY_SIGNALS]);
}

test('an interrupted run during which the clock stepped back is completed', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE broken (;\n');
  assert.equal((await migrate(url, directory)).ok, false);
  await stepClockBack(url);
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE fixed (id int);\n');
  assert.deepEqual(await migrate(url, directory), { ok: true, value: ['1792990000000_broken'] });
});

test('a database whose applied migrations are out of run order migrates again', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  assert.equal((await migrate(url, directory)).ok, true);
  await stepClockBack(url);
  await writeFile(join(directory, '1792990000000_add-note.sql'), '-- Up Migration\nCREATE TABLE note (id int);\n');
  assert.deepEqual(await migrate(url, directory), { ok: true, value: ['1792990000000_add-note'] });
});

test('a pending migration older than an applied one stops the run before anything is applied', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  assert.equal((await migrate(url, directory)).ok, true);
  await writeFile(join(directory, '1792929000000_older.sql'), '-- Up Migration\nCREATE TABLE older (id int);\n');
  await writeFile(join(directory, '1792990000000_add-note.sql'), '-- Up Migration\nCREATE TABLE note (id int);\n');
  const refused = await migrate(url, directory);
  assert.equal(!refused.ok && refused.error.code, 'precondition-failed');
  assert.equal(!refused.ok && refused.error.details.migrations, '1792929000000_older');
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name IN ('older', 'note')"), []);
});

test('a pending migration is ordered as node-pg-migrate runs the files', async (t) => {
  const cases = [
    { applied: '1_step10', pending: ['1_step2'] },
    { applied: '1_a', pending: ['1_a-b'] },
    { applied: '1792929600000_applied', pending: ['20200101000000000_older'] },
    { applied: '12_applied', pending: ['10_older', '9_older'], first: '9_older' },
  ];
  for (const { applied, pending, first = pending[0] } of cases) {
    await t.test(`${pending.join(', ')} after ${applied}`, async () => {
      const url = databaseUrl(SERVER_URL, await createTestDatabase());
      const directory = await mkdtemp(join(tmpdir(), 'taskelith-migrations-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      await writeFile(join(directory, `${applied}.sql`), '-- Up Migration\nSELECT 1;\n');
      assert.equal((await migrate(url, directory)).ok, true);
      for (const name of pending) await writeFile(join(directory, `${name}.sql`), '-- Up Migration\nSELECT 1;\n');
      const refused = await migrate(url, directory);
      assert.equal(!refused.ok && refused.error.details.migrations, first);
    });
  }
});

test('an applied migration without its file stops the run and is named', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  assert.equal((await migrate(url, directory)).ok, true);
  await unlink(join(directory, `${OBSERVABILITY_SIGNALS}.sql`));
  const refused = await migrate(url, directory);
  assert.equal(!refused.ok && refused.error.code, 'precondition-failed');
  assert.equal(!refused.ok && refused.error.details.migrations, OBSERVABILITY_SIGNALS);
});

test('a fixed pending migration is checked by its new content', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE broken (;\n');
  assert.equal((await migrate(url, directory)).ok, false);
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE fixed (id int);\n');
  assert.deepEqual(await migrate(url, directory), { ok: true, value: ['1792990000000_broken'] });
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [] });
});

test('an applied migration without a checksum stops the run', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  await query(url, 'DELETE FROM schema_migration_checksums');
  const unchecked = await migrate(url);
  assert.equal(!unchecked.ok && unchecked.error.code, 'precondition-failed');
});

test('a migration file other than SQL stops the run before anything is applied', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  await writeFile(join(directory, '1792990000000_script.js'), 'export const up = (pgm) => pgm.sql("CREATE TABLE script (id int)");\n');
  const rejected = await migrate(url, directory);
  assert.equal(!rejected.ok && rejected.error.code, 'precondition-failed');
  assert.equal(!rejected.ok && rejected.error.details.files, '1792990000000_script.js');
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name IN ('admissions', 'script')"), []);
});

test('a failing migration is reported, and an unreachable server is unavailable', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  await writeFile(join(directory, '1792990000000_broken.sql'), '-- Up Migration\nCREATE TABLE broken (;\n');
  const broken = await migrate(url, directory);
  assert.equal(!broken.ok && broken.error.code, 'internal');
  const unreachable = new URL(url);
  unreachable.port = '1';
  const refused = await migrate(unreachable);
  assert.equal(!refused.ok && refused.error.code, 'unavailable');
});

test('the inventory migration backfills no provenance, and its down migration removes what it added', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  const held = join(directory, `${INVENTORY_RECONCILIATION}.sql`);
  const later = [LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const [content, ...laterContents] = await Promise.all([held, ...later].map((path) => readFile(path, 'utf8')));
  await Promise.all([held, ...later].map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  const accepted = assignment('assignment-1');
  await query(url, `INSERT INTO assignments (id, attempt_id, worker_id, reservation_state, generation, record, project_id, run_id,
    task_id, root_task_id, cpu_millicores, memory_mebibytes, state, changed_at) VALUES ($1, $2, $3, 'held', 1, $4, 'p', 'r', 't', 't', 500, 512, 'accepted', $5)`,
  [accepted.id, accepted.attemptId, accepted.workerId, JSON.stringify(accepted), AT]);
  await query(url, "INSERT INTO producer_cursors (worker_id, journal_id, confirmed_through, applied_above) VALUES ('worker-1', 'journal-1', 4, '{}')");
  await writeFile(held, content!);
  await Promise.all(later.map((path, index) => writeFile(path, laterContents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [INVENTORY_RECONCILIATION, LAUNCH_RECONCILIATION, PLACEMENT_ROTATION, PLACEMENT_OUTCOMES, WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  assert.deepEqual(await query(url, 'SELECT accepted_journal_id, accepted_sequence FROM assignments'), [{ accepted_journal_id: null, accepted_sequence: null }]);
  assert.deepEqual(await query(url, 'SELECT retired_at, reported_snapshot FROM producer_cursors'), [{ retired_at: null, reported_snapshot: '0' }]);
  await query(url, content!.slice(content!.indexOf('-- Down Migration')));
  const columns = await query<{ column_name: string }>(url, `SELECT column_name FROM information_schema.columns
    WHERE table_name IN ('assignments', 'producer_cursors') AND column_name IN ('accepted_journal_id', 'accepted_sequence', 'retired_at', 'reported_snapshot')`);
  const tables = await query(url, "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'inventory%'");
  assert.deepEqual([columns, tables], [[], []]);
});

test('the launch reconciliation down migration removes the unrecorded processes', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${LAUNCH_RECONCILIATION}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name = 'unrecorded_processes'"), []);
});

test('the placement rotation down migration removes the rotation cursor', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${PLACEMENT_ROTATION}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name = 'placement_rotation'"), []);
});

test('the placement outcomes down migration removes the outcome records', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${PLACEMENT_OUTCOMES}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name = 'placement_outcomes'"), []);
});

test('the placement outcomes table rejects a disposition or source outside its values', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const insert = (disposition: string, source: string) => query(url, `INSERT INTO placement_outcomes
    (task_id, disposition, reason, source, recorded_at) VALUES ('task-1', $1, 'retry-budget-exhausted', $2, now())`, [disposition, source]);
  await assert.rejects(insert('standing', 'scheduler'), /placement_outcomes_disposition_check/);
  await assert.rejects(insert('rejected', 'worker'), /placement_outcomes_source_check/);
  await insert('rejected', 'scheduler');
  assert.deepEqual(await query(url, 'SELECT disposition, source FROM placement_outcomes'), [{ disposition: 'rejected', source: 'scheduler' }]);
});

test('the worker admission migration leaves every existing worker awaiting its self-check', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  const held = [WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL].map((name) => join(directory, `${name}.sql`));
  const contents = await Promise.all(held.map((path) => readFile(path, 'utf8')));
  await Promise.all(held.map((path) => unlink(path)));
  assert.equal((await migrate(url, directory)).ok, true);
  await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores,
    memory_mebibytes, controls, control_plane_hash, protocol_version) VALUES ('w1', true, false, false, true, 2, 4000, 8192, '{}', 'cp-1', 1)`);
  await Promise.all(held.map((path, index) => writeFile(path, contents[index]!)));
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [WORKER_ADMISSION, OPERATOR_ACCESS, ACCOUNT_POOL, SESSION_TIMELINE, SESSION_INBOX_ITEMS, SESSION_OUTPUT_TAIL] });
  assert.deepEqual(await query(url, 'SELECT worker_admission, self_check_sequence, self_check_reported_at FROM workers'),
    [{ worker_admission: 'awaiting-self-check', self_check_sequence: '0', self_check_reported_at: null }]);
  const database = new PostgresDatabase(url);
  try {
    const placement = value(await database.transaction(async (tx) => ({ ok: true as const, value: [await tx.workers.get('w1' as never), await tx.workers.candidates()] as const })));
    assert.deepEqual([placement[0]?.admitted, placement[1]], [false, []]);
  } finally {
    await database.close();
  }
});

test('the worker admission down migration removes the admission columns and results', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${WORKER_ADMISSION}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
  assert.deepEqual(await query(url, "SELECT 1 FROM information_schema.tables WHERE table_name = 'worker_self_check_results'"), []);
  assert.deepEqual(await query(url, `SELECT 1 FROM information_schema.columns WHERE table_name = 'workers'
    AND column_name IN ('worker_admission', 'self_check_sequence', 'self_check_reported_at')`), []);
});

test('the operator access migration keeps its audit trail immutable and its values in their shapes', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const owner = `u${'a'.repeat(32)}`;
  await query(url, "INSERT INTO principals (principal_id, kind, login_name, created_at) VALUES ($1, 'operator', 'owner', now())", [owner]);
  await assert.rejects(query(url, "INSERT INTO principals (principal_id, kind, login_name, created_at) VALUES ($1, 'council', 'c', now())", [`u${'b'.repeat(32)}`]),
    /principals_kind_check/);
  await assert.rejects(query(url, "INSERT INTO principals (principal_id, kind, login_name, created_at) VALUES ($1, 'operator', 'Owner', now())", [`u${'b'.repeat(32)}`]),
    /principals_login_name_check/);
  await assert.rejects(query(url, "INSERT INTO project_roles (project_id, principal_id, role, assigned_at) VALUES ('p', $1, 'admin', now())", [owner]),
    /project_roles_role_check/);
  await query(url, "INSERT INTO operator_principal (principal_id) VALUES ($1)", [owner]);
  await assert.rejects(query(url, "INSERT INTO operator_principal (principal_id) VALUES ($1)", [owner]), /duplicate key/);
  await query(url, `INSERT INTO access_audit_events (kind, principal_id, actor, reason, occurred_at)
    VALUES ('access.owner-created', $1, 'root', 'test', now())`, [owner]);
  await assert.rejects(query(url, "UPDATE access_audit_events SET reason = 'changed'"), /audit events are immutable/);
  await assert.rejects(query(url, 'DELETE FROM access_audit_events'), /audit events are immutable/);
});

test('the operator access down migration removes the access tables', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${OPERATOR_ACCESS}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
  const tables = await query(url, `SELECT 1 FROM information_schema.tables WHERE table_name IN
    ('principals', 'installation_roles', 'operator_principal', 'project_roles', 'browser_sessions', 'access_audit_events')`);
  assert.deepEqual(tables, []);
});

async function migratedDown(url: URL, name: string): Promise<void> {
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${name}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
}

test('the session inbox down migration removes its tables and keeps the session timeline tables', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  await migratedDown(url, SESSION_INBOX_ITEMS);
  const tables = await query<{ table_name: string }>(url, `SELECT table_name FROM information_schema.tables WHERE table_name IN
    ('session_inbox_items', 'session_audit_events', 'agent_sessions') ORDER BY table_name`);
  assert.deepEqual(tables.map((row) => row.table_name), ['agent_sessions']);
});

test('the open session inbox items index serves their listing in code-unit order without a sort', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const indexPlanner = new URL(url);
  indexPlanner.searchParams.set('options', '-c enable_seqscan=off -c enable_bitmapscan=off -c enable_sort=off');
  const plan = await query<{ 'QUERY PLAN': string }>(indexPlanner, `EXPLAIN SELECT item_id FROM session_inbox_items
    WHERE state = 'open' ORDER BY item_id COLLATE "C" LIMIT 10`);
  const steps = plan.map((row) => row['QUERY PLAN']).join('\n');
  assert.match(steps, /Index (Only )?Scan using session_inbox_items_open/);
  assert.doesNotMatch(steps, /Sort/);
});

test('the session output tail down migration removes its table and keeps the session timeline and inbox tables', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  await migratedDown(url, SESSION_OUTPUT_TAIL);
  const tables = await query<{ table_name: string }>(url, `SELECT table_name FROM information_schema.tables WHERE table_name IN
    ('agent_session_output_tails', 'agent_session_output', 'agent_sessions', 'session_inbox_items') ORDER BY table_name`);
  assert.deepEqual(tables.map((row) => row.table_name), ['agent_session_output', 'agent_sessions', 'session_inbox_items']);
});

test('the session timeline down migration removes the session timeline tables', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  await migratedDown(url, SESSION_OUTPUT_TAIL);
  await migratedDown(url, SESSION_INBOX_ITEMS);
  await migratedDown(url, SESSION_TIMELINE);
  const tables = await query(url, `SELECT 1 FROM information_schema.tables WHERE table_name IN
    ('agent_sessions', 'agent_session_output', 'agent_session_attempts', 'session_idempotency_keys')`);
  assert.deepEqual(tables, []);
});

test('the account pool migration checks slot values and its down migration removes its tables', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.equal((await migrate(url)).ok, true);
  const insert = (state: string, projects: string, usage: string) => query(url, `INSERT INTO account_slots (slot_id, harness_id, mechanism_id,
    credential_version, allowed_projects, concurrency_limit, state, health, usage_fraction, usage_window_ends_at, revision)
    VALUES ('slot-1', 'h', 'm', 1, '${projects}', 4, '${state}', 'healthy', ${usage}, 1)`);
  await assert.rejects(insert('paused', '{p}', 'NULL, NULL'), /account_slots_state_check/);
  await assert.rejects(insert('active', '{}', 'NULL, NULL'), /account_slots_allowed_projects_check/);
  for (const projects of ['{p,p}', '{p,NULL}', '{{p},{q}}']) {
    await assert.rejects(insert('active', projects, 'NULL, NULL'), /account_slots_allowed_projects_check/, projects);
  }
  await assert.rejects(insert('active', '{p}', '1.5, now()'), /account_slots_usage_fraction_check/);
  await assert.rejects(insert('active', '{p}', '0.5, NULL'), /account_slots_check/);
  await insert('active', '{p}', '0.5, now()');
  const content = await readFile(join(MIGRATIONS_DIRECTORY, `${ACCOUNT_POOL}.sql`), 'utf8');
  await query(url, content.slice(content.indexOf('-- Down Migration')));
  const tables = await query(url, `SELECT 1 FROM information_schema.tables WHERE table_name IN
    ('account_slots', 'slot_credential_counters', 'slot_credentials')`);
  assert.deepEqual(tables, []);
  assert.deepEqual(await query(url, "SELECT 1 FROM pg_proc WHERE proname = 'account_slot_distinct_projects'"), []);
});
