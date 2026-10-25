import assert from 'node:assert/strict';
import { after } from 'node:test';
import pg from 'pg';
import { integrationEndpoint } from '@taskelith/testing';
import { migrate } from '@taskelith/postgres';

export const SERVER_URL = integrationEndpoint('TASKELITH_POSTGRES_URL');
export const PROXY_URL = integrationEndpoint('TASKELITH_POSTGRES_PROXY_URL');

const TABLES = [
  'workflow_runs', 'gates', 'admissions', 'tasks', 'assignments', 'outbox', 'inbox',
  'task_lineage', 'capacity_charges', 'delegations', 'capacity_quotas', 'workers', 'installation',
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

// The test password is also the user and database name, so it is looked
// for in the forms a URL or a libpq string would give it.
export function assertNoPassword(text: string, password: string): void {
  for (const form of [`:${password}@`, `password=${password}`]) assert.ok(!text.includes(form), `${form} was logged`);
}

export async function truncateAll(url: URL): Promise<void> {
  await query(url, `TRUNCATE ${TABLES.join(', ')}`);
}

async function administer(statement: string): Promise<void> {
  await query(SERVER_URL, statement);
}
