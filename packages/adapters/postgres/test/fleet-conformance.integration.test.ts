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
import { parseInstant } from '@taskelith/kernel';
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
    slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit', 'memory-limit'],
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
