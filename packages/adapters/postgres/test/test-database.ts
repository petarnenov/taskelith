import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import pg from 'pg';
import { integrationEndpoint } from '@taskelith/testing';
import { migrate } from '@taskelith/postgres';

export const SERVER_URL = integrationEndpoint('TASKELITH_POSTGRES_URL');
export const PROXY_URL = integrationEndpoint('TASKELITH_POSTGRES_PROXY_URL');

const TABLES = [
  'workflow_runs', 'gates', 'admissions', 'tasks', 'assignments', 'outbox', 'inbox',
  'task_lineage', 'capacity_charges', 'delegations', 'capacity_quotas', 'workers', 'installation',
  'operator_credentials', 'audit_events', 'enrollment_tokens', 'broker_revocations', 'evidence', 'launch_authorizations',
  'launch_rejections', 'current_revisions', 'delegation_requests', 'producer_cursors', 'inventory_requests', 'inventory_report_parts',
  'unrecorded_processes', 'placement_rotation', 'placement_outcomes', 'worker_self_check_results',
  'principals', 'installation_roles', 'operator_principal', 'project_roles', 'browser_sessions', 'access_audit_events',
];
let created = 0;

// Each test file gets a database of its own, since files run in parallel;
// it is migrated, and dropped when the file ends.
export async function createTestDatabase(): Promise<string> {
  const name = `taskelith_test_${process.pid}_${++created}`;
  await administer(`CREATE DATABASE ${name}`);
  after(() => administer(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
  return name;
}

export async function createMigratedDatabase(): Promise<URL> {
  const url = databaseUrl(SERVER_URL, await createTestDatabase());
  const migrated = await migrate(url);
  if (!migrated.ok) throw new Error(migrated.error.message);
  return url;
}

export function databaseUrl(server: URL, name: string): URL {
  const url = new URL(server);
  url.pathname = `/${name}`;
  return url;
}

export async function query<Row extends pg.QueryResultRow>(url: URL, text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

// A login role of this database with a password found nowhere else, so a
// test can show that the password never reaches a log record.
export async function sentinelCredentials(url: URL): Promise<URL> {
  const role = `observer_${process.pid}_${++created}`;
  const password = `sentinel-${randomUUID()}`;
  await query(url, `CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  await query(url, `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`);
  await query(url, `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  after(async () => {
    await query(url, `DROP OWNED BY ${role}`).catch(() => undefined);
    await administer(`DROP ROLE IF EXISTS ${role}`);
  });
  const credentialed = new URL(url);
  credentialed.username = role;
  credentialed.password = password;
  return credentialed;
}

// Sentinel credentials whose `now()` resolves before pg_catalog's and stands
// at `at`, so an age is read on a database clock that never steps.
export async function pinnedClockCredentials(url: URL, at: string): Promise<URL> {
  const credentials = await sentinelCredentials(url);
  const role = credentials.username;
  await query(url, 'CREATE SCHEMA pinned_clock');
  await query(url, `CREATE FUNCTION pinned_clock.now() RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT '${at}'::timestamptz $$`);
  await query(url, `GRANT USAGE ON SCHEMA pinned_clock TO ${role}`);
  await query(url, `ALTER ROLE ${role} SET search_path = pinned_clock, pg_catalog, "$user", public`);
  return credentials;
}

export function assertNoPassword(text: string, password: string): void {
  for (const form of [password, encodeURIComponent(password)]) assert.ok(!text.includes(form), 'the password was logged');
}

export async function truncateAll(url: URL): Promise<void> {
  await query(url, `TRUNCATE ${TABLES.join(', ')}`);
}

async function administer(statement: string): Promise<void> {
  await query(SERVER_URL, statement);
}
