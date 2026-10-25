import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { OPERATOR_CREDENTIALS_CONFORMANCE } from '@taskelith/access';
import { FLEET_REGISTRY_CONFORMANCE, INSTALLATION_TABLE_CONFORMANCE, fleetToken, fleetWorker, installationIdentity } from '@taskelith/fleet';
import {
  CommittingFleetRegistry,
  CommittingInstallationTable,
  CommittingOperatorCredentials,
  PostgresDatabase,
} from '@taskelith/postgres';
import type { ConformanceCase } from '@taskelith/sdlc';
import { ok, parseInstant } from '@taskelith/kernel';
import { value } from '@taskelith/testing';
import pg from 'pg';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

function runSuite<Port>(port: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`PostgreSQL ${port}: ${conformance.name}`, { concurrency: false }, async () => {
      await truncateAll(url);
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('fleet registry', FLEET_REGISTRY_CONFORMANCE, () => new CommittingFleetRegistry(database));
runSuite('installation table', INSTALLATION_TABLE_CONFORMANCE, () => new CommittingInstallationTable(database));
runSuite('operator credentials', OPERATOR_CREDENTIALS_CONFORMANCE, () => new CommittingOperatorCredentials(database));

test('an enrolled worker is placeable once reachable, and a revoked one is not', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  value(await registry.addToken(fleetToken('t1')));
  const worker = fleetWorker('w1', 'j1');
  value(await registry.enroll(fleetToken('t1').hash, worker));
  const placement = () => database.transaction(async (tx) => ({ ok: true as const, value: await tx.workers.get(worker.workerId) }));

  assert.deepEqual(value(await placement()), {
    workerId: worker.workerId, enrolled: true, revoked: false, draining: false, reachable: false,
    slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit', 'memory-limit'], protocolVersion: 1,
  });
  value(await registry.revoke(worker.workerId, worker.enrolledAt));
  assert.equal(value(await placement())?.revoked, true);
});

test('a token that expires while its use waits for the row lock enrolls nothing', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const expiresAt = value(parseInstant(new Date(Date.now() + 1000).toISOString()));
  value(await registry.addToken(fleetToken('t1', {}, expiresAt)));
  const holder = new pg.Client({ connectionString: url.href });
  await holder.connect();
  await holder.query('BEGIN');
  await holder.query("SELECT 1 FROM enrollment_tokens WHERE secret_hash = 't1' FOR UPDATE");
  const enrolling = registry.enroll(fleetToken('t1').hash, fleetWorker('w1', 'j1'));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await holder.query('COMMIT');
  await holder.end();
  const enrolled = await enrolling;
  assert.equal(!enrolled.ok && enrolled.error.details.reason, 'token-expired');
});

test('a publisher that waited for the lock pushes every entry committed meanwhile', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  for (const [workerId, journalId] of [['w1', 'j1'], ['w2', 'j2']] as const) {
    value(await registry.addToken(fleetToken(`t-${workerId}`)));
    value(await registry.enroll(fleetToken(`t-${workerId}`).hash, fleetWorker(workerId, journalId)));
  }
  value(await registry.revoke(fleetWorker('w1', 'j1').workerId, fleetWorker('w1', 'j1').enrolledAt));
  const holder = new pg.Client({ connectionString: url.href });
  await holder.connect();
  await holder.query('SELECT pg_advisory_lock(1792930400)');
  const pushes: string[][] = [];
  const push = async (revocations: readonly { userKey: string }[]) => {
    pushes.push(revocations.map((revocation) => revocation.userKey));
    return ok(undefined);
  };
  const publishing = registry.publishRevocations(push);
  // The barrier: the publisher is waiting for the advisory lock.
  await waitForWaitingLock(holder);
  value(await registry.revoke(fleetWorker('w2', 'j2').workerId, fleetWorker('w2', 'j2').enrolledAt));
  await holder.query('SELECT pg_advisory_unlock(1792930400)');
  await holder.end();

  assert.equal(value(await publishing), 2);
  assert.deepEqual(pushes, [['U-w1-1', 'U-w2-1']]);
  assert.equal(value(await registry.publishRevocations(push)), 0);
});

async function waitForWaitingLock(client: pg.Client): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    const { rows } = await client.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND objid = 1792930400 AND NOT granted
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    if (rows[0]!.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('the publisher never waited for the advisory lock');
}

test('a due row whose record holds no predecessor expires nothing', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const worker = fleetWorker('w1', 'j1');
  value(await registry.addToken(fleetToken('t1')));
  value(await registry.enroll(fleetToken('t1').hash, worker));
  await query(url, "UPDATE workers SET predecessor_valid_until = '2020-01-01T00:00:00Z'");
  const enrollment = await query(url, 'SELECT enrollment FROM workers');

  assert.equal(value(await registry.expirePredecessors(worker.enrolledAt)), 0);
  assert.deepEqual(await query(url, 'SELECT enrollment FROM workers'), enrollment, 'the record is unchanged');
  assert.deepEqual(await query(url, 'SELECT user_key FROM broker_revocations'), [], 'nothing is revoked');
});

test('the initialized installation is not quarantined', { concurrency: false }, async () => {
  await truncateAll(url);
  const guard = () => database.transaction(async (tx) => ({ ok: true as const, value: await tx.installation.quarantined() }));
  assert.equal(value(await guard()), true, 'an uninitialized installation admits nothing');
  value(await new CommittingInstallationTable(database).initialize(value(installationIdentity('install-1', 1))));
  assert.equal(value(await guard()), false);
});

test('audit events cannot be changed or removed', { concurrency: false }, async () => {
  await truncateAll(url);
  for (const conformance of OPERATOR_CREDENTIALS_CONFORMANCE.slice(1, 2)) await conformance.check(new CommittingOperatorCredentials(database));
  await assert.rejects(query(url, "UPDATE audit_events SET reason = 'changed'"), /audit events are immutable/);
  await assert.rejects(query(url, 'DELETE FROM audit_events'), /audit events are immutable/);
});

test('a hash column refuses a second worker, and a row without a record is no worker', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  value(await registry.addToken(fleetToken('t1')));
  const worker = fleetWorker('w1', 'j1');
  value(await registry.enroll(fleetToken('t1').hash, worker));
  const hash = worker.credentials.current.controlPlaneHash;
  await assert.rejects(query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores,
    memory_mebibytes, controls, control_plane_hash) VALUES ('w2', true, false, false, false, 1, 1, 1, '{}', $1)`, [hash]), /unique/);
  await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores,
    memory_mebibytes, controls, control_plane_hash) VALUES ('w3', true, false, false, false, 1, 1, 1, '{}', 'cp-orphan')`);
  assert.equal(value(await registry.workerByCredentialHash('cp-orphan' as never)), undefined);
});
