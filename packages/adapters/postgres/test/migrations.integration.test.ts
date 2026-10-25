import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MIGRATIONS_DIRECTORY, migrate } from '@taskelith/postgres';
import { SERVER_URL, createTestDatabase, databaseUrl, query } from './test-database.ts';

const INITIAL = '1792929600000_initial-state';
const RESOURCE_ADMISSION = '1792930000000_resource-admission';
const ENROLLMENT = '1792930400000_installation-and-enrollment';

async function copiedMigrations(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'taskelith-migrations-'));
  await cp(MIGRATIONS_DIRECTORY, directory, { recursive: true });
  test.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('migrations apply once, record their checksums, and create the schema', async () => {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  assert.deepEqual(await migrate(url), { ok: true, value: [INITIAL, RESOURCE_ADMISSION, ENROLLMENT] });
  assert.deepEqual(await migrate(url), { ok: true, value: [] });
  const checksums = await query<{ name: string; sha256: string }>(url, 'SELECT name, sha256 FROM schema_migration_checksums');
  assert.deepEqual(checksums.map((row) => row.name).sort(), [INITIAL, RESOURCE_ADMISSION, ENROLLMENT]);
  assert.match(checksums[0]!.sha256, /^[0-9a-f]{64}$/);
  const tables = await query<{ table_name: string }>(
    url, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  assert.deepEqual(tables.map((row) => row.table_name), [
    'admissions', 'assignments', 'audit_events', 'broker_revocations', 'capacity_charges', 'capacity_quotas', 'delegations', 'enrollment_tokens', 'gates',
    'inbox', 'installation', 'operator_credentials', 'outbox', 'schema_migration_checksums', 'schema_migrations', 'task_lineage',
    'tasks', 'workers', 'workflow_runs',
  ]);
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
