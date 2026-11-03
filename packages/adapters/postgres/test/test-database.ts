import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
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
  'projects', 'project_defaults', 'auto_merge_settings',
  'agent_sessions', 'agent_session_output', 'agent_session_output_tails', 'agent_session_attempts', 'session_idempotency_keys', 'session_inbox_items',
  'session_audit_events',
  'account_slots', 'slot_credentials', 'slot_credential_counters', 'slot_credential_deliveries',
  'ui_events',
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

export interface SteppedClock {
  readonly credentials: URL;
  // Moves the clock to `at` plus the given milliseconds.
  stepTo(milliseconds: number): Promise<void>;
}

// Sentinel credentials whose `clock_timestamp()` stands at `at` plus a
// sequence's value, which a step changes at once, outside any snapshot.
export async function steppedClockCredentials(url: URL, at: string): Promise<SteppedClock> {
  const credentials = await sentinelCredentials(url);
  const role = credentials.username;
  await query(url, 'CREATE SCHEMA stepped_clock');
  await query(url, 'CREATE SEQUENCE stepped_clock.offset_milliseconds MINVALUE 0 START 0');
  await query(url, `CREATE FUNCTION stepped_clock.clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$
    SELECT '${at}'::timestamptz + last_value * interval '1 millisecond' FROM stepped_clock.offset_milliseconds $$`);
  await query(url, `GRANT USAGE ON SCHEMA stepped_clock TO ${role}`);
  await query(url, `GRANT SELECT ON stepped_clock.offset_milliseconds TO ${role}`);
  await query(url, `ALTER ROLE ${role} SET search_path = stepped_clock, pg_catalog, "$user", public`);
  return {
    credentials,
    stepTo: async (milliseconds) => {
      await query(url, "SELECT setval('stepped_clock.offset_milliseconds', $1, true)", [milliseconds]);
    },
  };
}

export function assertNoPassword(text: string, password: string): void {
  for (const form of [password, encodeURIComponent(password)]) assert.ok(!text.includes(form), 'the password was logged');
}

// Settles once every unnumbered entry of this cluster is below the horizon:
// the cluster's other test files can hold transactions that delay numbering.
export async function untilNumberable(url: URL): Promise<void> {
  await untilHorizonAbove(url, `coalesce((SELECT max(inserted_by) FROM ui_events
    WHERE position IS NULL AND inserted_by < pg_snapshot_xmax(pg_current_snapshot())), '0'::xid8)`);
}

// Settles once the oldest open transaction is newer than the given one.
export async function untilEnded(url: URL, transaction: string): Promise<void> {
  await untilHorizonAbove(url, `'${BigInt(transaction)}'::xid8`);
}

const HORIZON_POLL_MILLISECONDS = 20;
const HORIZON_WAIT_MILLISECONDS = 20_000;

async function untilHorizonAbove(url: URL, transaction: string): Promise<void> {
  const statement = `SELECT pg_snapshot_xmin(pg_current_snapshot()) > ${transaction} AS above`;
  const deadline = performance.now() + HORIZON_WAIT_MILLISECONDS;
  while (!(await query<{ above: boolean }>(url, statement))[0]!.above) {
    if (performance.now() > deadline) throw new Error('the numbering horizon did not move past the transaction');
    await delay(HORIZON_POLL_MILLISECONDS);
  }
}

// The event sequence keeps its one row, set back to before any event.
export async function truncateAll(url: URL): Promise<void> {
  await query(url, `TRUNCATE ${TABLES.join(', ')}`);
  await query(url, 'UPDATE ui_event_sequence SET head = 0, floor = 0');
}

async function administer(statement: string): Promise<void> {
  await query(SERVER_URL, statement);
}
