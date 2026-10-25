import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { runner } from 'node-pg-migrate';
import pg from 'pg';

export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations', import.meta.url));
const MIGRATIONS_TABLE = 'schema_migrations';
const CHECKSUMS_TABLE = 'schema_migration_checksums';
// An arbitrary advisory lock key, held around the whole run with its checks.
const MIGRATION_LOCK = 7_221_604_311;

interface MigrationFile {
  readonly name: string;
  readonly sha256: string;
}

// Applies the pending migrations, one transaction per file, after checking
// applied files against checksums recorded before they ran.
export async function migrate(url: URL, directory: string = MIGRATIONS_DIRECTORY): Promise<Result<readonly string[]>> {
  const client = new pg.Client({ connectionString: url.href });
  try {
    await client.connect();
  } catch (error) {
    return err(failure('unavailable', `PostgreSQL is not reachable: ${(error as Error).message}`));
  }
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS ${CHECKSUMS_TABLE} (name text PRIMARY KEY, sha256 text NOT NULL)`);
    const files = await migrationFiles(directory);
    const changed = await changedAppliedFiles(client, files);
    if (changed.length > 0) {
      return err(failure('precondition-failed', `applied migrations differ from their files: ${changed.join(', ')}`, { migrations: changed.join(',') }));
    }
    await recordPendingChecksums(client, files);
    const applied = await runner({
      dbClient: client, dir: directory, migrationsTable: MIGRATIONS_TABLE, direction: 'up',
      checkOrder: true, singleTransaction: false, noLock: true, log: () => {},
    });
    return ok(applied.map((migration) => migration.name));
  } catch (error) {
    return err(failure('internal', `migration failed: ${(error as Error).message}`));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function migrationFiles(directory: string): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(names.map(async (file) => ({
    name: basename(file, '.sql'),
    sha256: createHash('sha256').update(await readFile(join(directory, file))).digest('hex'),
  })));
}

// An applied migration whose file is missing, whose checksum differs, or
// that has no checksum, which only a migration run outside this one leaves.
async function changedAppliedFiles(client: pg.Client, files: readonly MigrationFile[]): Promise<readonly string[]> {
  const exists = await client.query('SELECT to_regclass($1) AS table', [MIGRATIONS_TABLE]);
  if (exists.rows[0]?.table === null) return [];
  const applied = await client.query<{ name: string; sha256: string | null }>(
    `SELECT m.name, c.sha256 FROM ${MIGRATIONS_TABLE} m LEFT JOIN ${CHECKSUMS_TABLE} c ON c.name = m.name ORDER BY m.id`,
  );
  const byName = new Map(files.map((file) => [file.name, file.sha256]));
  return applied.rows
    .filter((row) => row.sha256 === null || row.sha256 !== byName.get(row.name))
    .map((row) => row.name);
}

// Records the checksum of every file not yet applied before any of them
// runs, so a file applied by an interrupted run is checked next time.
async function recordPendingChecksums(client: pg.Client, files: readonly MigrationFile[]): Promise<void> {
  const exists = await client.query('SELECT to_regclass($1) AS table', [MIGRATIONS_TABLE]);
  const appliedFilter = exists.rows[0]?.table === null ? '' : `WHERE f.name NOT IN (SELECT name FROM ${MIGRATIONS_TABLE})`;
  await client.query(
    `INSERT INTO ${CHECKSUMS_TABLE} (name, sha256)
     SELECT f.name, f.sha256 FROM unnest($1::text[], $2::text[]) AS f(name, sha256) ${appliedFilter}
     ON CONFLICT (name) DO UPDATE SET sha256 = excluded.sha256`,
    [files.map((file) => file.name), files.map((file) => file.sha256)],
  );
}
