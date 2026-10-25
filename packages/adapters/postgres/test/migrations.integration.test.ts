import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { recordExecutionEvidence } from '@taskelith/execution';
import { fleetWorker } from '@taskelith/fleet';
import { MIGRATIONS_DIRECTORY, migrate } from '@taskelith/postgres';
import { value } from '@taskelith/testing';
import { authorizedUnder, placedTask } from './capacity-fixtures.ts';
import { AT, assignment } from './fixtures.ts';
import { SERVER_URL, createTestDatabase, databaseUrl, query } from './test-database.ts';

const INITIAL = '1792929600000_initial-state';
const RESOURCE_ADMISSION = '1792930000000_resource-admission';
const OBSERVABILITY_SIGNALS = '1792930400000_observability-signals';
const ENROLLMENT = '1792930800000_installation-and-enrollment';
const CONTROL_PLANE_API = '1792931200000_control-plane-api';
const WORKER_BEARER = '1792931600000_worker-bearer-authentication';
const LAUNCH_AUTHORITY = '1792932000000_launch-authority';

async function copiedMigrations(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'taskelith-migrations-'));
  await cp(MIGRATIONS_DIRECTORY, directory, { recursive: true });
  test.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('migrations apply once, record their checksums, and create the schema', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.deepEqual(await migrate(url), { ok: true, value: [INITIAL, RESOURCE_ADMISSION, OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, LAUNCH_AUTHORITY] });
  assert.deepEqual(await migrate(url), { ok: true, value: [] });
  const checksums = await query<{ name: string; sha256: string }>(url, 'SELECT name, sha256 FROM schema_migration_checksums');
  assert.deepEqual(checksums.map((row) => row.name).sort(), [INITIAL, RESOURCE_ADMISSION, OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, LAUNCH_AUTHORITY]);
  assert.match(checksums[0]!.sha256, /^[0-9a-f]{64}$/);
  const tables = await query<{ table_name: string }>(
    url, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  assert.deepEqual(tables.map((row) => row.table_name), [
    'admissions', 'assignments', 'audit_events', 'broker_revocations', 'capacity_charges', 'capacity_quotas', 'current_revisions', 'delegations',
    'enrollment_tokens', 'gates', 'inbox', 'installation', 'launch_authorizations', 'launch_rejections', 'operator_credentials', 'outbox',
    'schema_migration_checksums', 'schema_migrations', 'task_lineage', 'tasks', 'workers', 'workflow_runs',
  ]);
});

test('the signals migration copies the state, change time, and unknown executions of stored records', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  // The signals migration and every later one wait, so they apply in order.
  const held = [OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, LAUNCH_AUTHORITY].map((name) => join(directory, `${name}.sql`));
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
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [OBSERVABILITY_SIGNALS, ENROLLMENT, CONTROL_PLANE_API, WORKER_BEARER, LAUNCH_AUTHORITY] });
  const [row] = await query<{ state: string; changed_at: Date }>(url, 'SELECT state, changed_at FROM assignments');
  assert.deepEqual([row!.state, row!.changed_at.toISOString()], ['offered', AT]);
  const tasks = await query<{ unknown_executions: number }>(url, 'SELECT unknown_executions FROM tasks ORDER BY unknown_executions');
  assert.deepEqual(tasks.map((task) => task.unknown_executions), [0, 1]);
});

test('the bearer migration copies the control-plane hashes of enrolled workers', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const directory = await copiedMigrations();
  const held = [WORKER_BEARER, LAUNCH_AUTHORITY].map((name) => join(directory, `${name}.sql`));
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
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [WORKER_BEARER, LAUNCH_AUTHORITY] });
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
  const held = join(directory, `${LAUNCH_AUTHORITY}.sql`);
  const content = await readFile(held, 'utf8');
  await unlink(held);
  assert.equal((await migrate(url, directory)).ok, true);
  const offered = assignment('assignment-1');
  const authorized = authorizedUnder(placedTask('task-1', 'attempt-1'), offered.id, offered.workerId);
  const grant = authorized.attempts[0]!.executions[0]!.grants[0]!;
  await query(url, 'INSERT INTO tasks (id, admission_id, generation, record) VALUES ($1, $2, 1, $3)',
    [authorized.id, authorized.admissionId, JSON.stringify({ ...authorized, probe: 'spec\uD800.md \u0000 \\ud800' })]);
  await writeFile(held, content);
  assert.deepEqual(await migrate(url, directory), { ok: true, value: [LAUNCH_AUTHORITY] });
  const rows = await query(url, `SELECT launch_auth_id, worker_id, operation_id, task_id, attempt_id, assignment_id, execution_id,
    run_id, relied_on_gates, artifact_ids, live FROM launch_authorizations`);
  assert.deepEqual(rows, [{
    launch_auth_id: grant.launchAuthId, worker_id: grant.workerId, operation_id: grant.operationId, task_id: authorized.id,
    attempt_id: grant.attemptId, assignment_id: grant.assignmentId, execution_id: grant.executionId, run_id: null,
    relied_on_gates: [...grant.reliedOnGates], artifact_ids: grant.artifacts.map((artifact) => artifact.artifactId), live: true,
  }]);
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
