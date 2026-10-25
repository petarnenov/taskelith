import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import pg from 'pg';
import { HeartbeatService, LostContactCheck, ObservationService } from '@taskelith/control-plane';
import { fleetToken, fleetWorker } from '@taskelith/fleet';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import { failed, integrationEndpoint, value } from '@taskelith/testing';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_heartbeat_${process.pid}`;
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

const heartbeats = new HeartbeatService(database);
const check = new LostContactCheck(database, { timeoutMilliseconds: 30_000 });
let confirmations = 0;
const observations = new ObservationService(database, {
  newConfirmationId: () => `confirmation-${++confirmations}`, newRequestId: () => `request-${++confirmations}`,
});

beforeEach(async () => {
  await sql('TRUNCATE workers, enrollment_tokens, inbox, outbox, producer_cursors, inventory_requests, inventory_report_parts');
});

// Each worker enrolls with a journal of its own.
function journalOf(workerId: string): string {
  return `journal-${workerId}`;
}

async function enroll(workerId: string, revokedAt?: string): Promise<void> {
  const worker = fleetWorker(workerId, journalOf(workerId), revokedAt === undefined ? {} : { revokedAt: revokedAt as never });
  value(await database.transaction(async (tx) => {
    const added = await tx.fleet.addToken(fleetToken(`token-${workerId}`));
    return added.ok ? tx.fleet.enroll(`token-${workerId}` as never, worker) : added;
  }));
}

function heartbeat(workerId: string, journalId = journalOf(workerId)) {
  return {
    subjectWorkerId: workerId,
    body: { messageType: 'worker.heartbeat', schemaVersion: 1, protocolVersion: 1, workerId, journalId, sentAt: '2026-10-26T09:00:00.000Z' },
  };
}

function declaration(workerId: string, sequence: number, journalId = journalOf(workerId)) {
  const metadata = {
    observationId: `observation-${journalId}-${sequence}`, observationType: 'worker.capacity.declared', schemaVersion: 1, protocolVersion: 1,
    occurredAt: '2026-10-26T09:00:00.000Z', correlationId: 'correlation-1', workerId, journalId, sequence,
  };
  const payload = {
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: [] }, protocolVersions: { minimum: 1, maximum: 1 },
  };
  return { subjectWorkerId: workerId, type: 'worker.capacity.declared', body: { metadata, payload } };
}

async function reachable(workerId: string): Promise<boolean | undefined> {
  return (await sql<{ reachable: boolean }>('SELECT reachable FROM workers WHERE worker_id = $1', [workerId]))[0]?.reachable;
}

// Moves the worker's last contact back, as if it had been silent that long.
async function silentFor(workerId: string, seconds: number): Promise<void> {
  await sql(`UPDATE workers SET last_contact_at = now() - make_interval(secs => $2) WHERE worker_id = $1`, [workerId, seconds]);
}

test('a heartbeat records contact at the database time', async () => {
  await enroll('worker-a');
  value(await heartbeats.record(heartbeat('worker-a')));
  const [row] = await sql<{ reachable: boolean; recent: boolean }>(
    `SELECT reachable, last_contact_at > now() - interval '1 minute' AS recent FROM workers WHERE worker_id = 'worker-a'`,
  );
  assert.deepEqual(row, { reachable: true, recent: true });
});

test('only a worker silent for longer than the timeout loses contact, and any contact restores it', async () => {
  for (const workerId of ['worker-a', 'worker-b', 'worker-c']) {
    await enroll(workerId);
    value(await heartbeats.record(heartbeat(workerId)));
  }
  await silentFor('worker-a', 31);
  await silentFor('worker-b', 31);
  await silentFor('worker-c', 20);
  assert.deepEqual(value(await check.markLost()), ['worker-a', 'worker-b']);
  assert.deepEqual([await reachable('worker-a'), await reachable('worker-b'), await reachable('worker-c')], [false, false, true]);

  value(await heartbeats.record(heartbeat('worker-a')));
  assert.equal(value(await observations.apply(declaration('worker-b', 1))), 'applied');
  assert.deepEqual([await reachable('worker-a'), await reachable('worker-b')], [true, true]);
  assert.deepEqual(value(await check.markLost()), []);
});

// Whether a statement of this database waits for a row lock.
async function waitsForLock(): Promise<boolean> {
  const [row] = await sql<{ waiting: number }>(
    `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'`, [databaseName],
  );
  return row!.waiting > 0;
}

async function until(condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met within 10 s');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { open, opened };
}

async function silentWorker(): Promise<void> {
  await enroll('worker-a');
  value(await heartbeats.record(heartbeat('worker-a')));
  await silentFor('worker-a', 31);
}

test('a heartbeat that waits for the check commits after it and leaves the worker reachable', async () => {
  await silentWorker();
  const marked = gate();
  const release = gate();
  const checking = database.transaction(async (tx) => {
    const before = new Date(Date.parse(await tx.now()) - 30_000).toISOString() as never;
    const lost = await tx.reports.markContactLost(before, 10);
    marked.open();
    await release.opened;
    return lost;
  });
  await marked.opened;
  const contact = heartbeats.record(heartbeat('worker-a'));
  await until(waitsForLock);
  release.open();
  assert.deepEqual(value(await checking), ['worker-a']);
  value(await contact);
  assert.equal(await reachable('worker-a'), true);
});

test('a check that waits for a heartbeat runs again and keeps the worker reachable', async () => {
  await silentWorker();
  const contacted = gate();
  const release = gate();
  const contact = database.transaction(async (tx) => {
    const recorded = await tx.reports.recordContact('worker-a' as never, await tx.now());
    contacted.open();
    await release.opened;
    return recorded;
  });
  await contacted.opened;
  const checking = check.markLost();
  await until(waitsForLock);
  release.open();
  value(await contact);
  assert.deepEqual(value(await checking), []);
  assert.equal(await reachable('worker-a'), true);
});

test('a revoked worker\'s heartbeat records no contact', async () => {
  await enroll('worker-a', '2026-10-26T08:00:00.000Z');
  assert.equal(failed(await heartbeats.record(heartbeat('worker-a'))).code, 'forbidden');
  assert.equal(await reachable('worker-a'), false);
});

test('a new incarnation\'s heartbeat authenticates only after an observation replaced the journal', async () => {
  await enroll('worker-a');
  assert.equal(failed(await heartbeats.record(heartbeat('worker-a', 'journal-new'))).code, 'forbidden', 'a heartbeat replaces no journal');
  assert.deepEqual(await sql('SELECT journal_id FROM producer_cursors'), []);
  assert.equal(await reachable('worker-a'), false);

  assert.equal(value(await observations.apply(declaration('worker-a', 1, 'journal-new'))), 'applied');
  await silentFor('worker-a', 31);
  assert.deepEqual(value(await check.markLost()), ['worker-a']);
  value(await heartbeats.record(heartbeat('worker-a', 'journal-new')));
  assert.equal(await reachable('worker-a'), true);
  await silentFor('worker-a', 31);
  value(await check.markLost());
  assert.equal(failed(await heartbeats.record(heartbeat('worker-a'))).code, 'forbidden', 'the replaced journal is refused');
  assert.equal(await reachable('worker-a'), false);
});

test('a heartbeat of the enrolled journal after a rollback retired it records no contact', async () => {
  await enroll('worker-a');
  for (const sequence of [1, 2]) assert.equal(value(await observations.apply(declaration('worker-a', sequence))), 'applied');
  const rolledBack = { ...declaration('worker-a', 1), body: { ...declaration('worker-a', 1).body } };
  rolledBack.body.metadata = { ...rolledBack.body.metadata, observationId: 'observation-after-rollback' };
  assert.equal(failed(await observations.apply(rolledBack)).details.reason, 'not-consumed');
  const [before] = await sql<{ reachable: boolean; last_contact_at: Date }>(`SELECT reachable, last_contact_at FROM workers WHERE worker_id = 'worker-a'`);
  assert.equal(before!.reachable, false, 'the rollback retired the journal');

  assert.equal(failed(await heartbeats.record(heartbeat('worker-a'))).code, 'forbidden');
  const [after] = await sql<{ reachable: boolean; last_contact_at: Date }>(`SELECT reachable, last_contact_at FROM workers WHERE worker_id = 'worker-a'`);
  assert.deepEqual(after, before);
});
