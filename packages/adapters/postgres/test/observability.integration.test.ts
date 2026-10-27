import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { ok } from '@taskelith/kernel';
import { recordExecutionEvidence, type WorkerId } from '@taskelith/execution';
import { CONTROL_PLANE_SIGNALS_CONFORMANCE, InMemoryLogSink, InMemoryMetrics, Logger } from '@taskelith/observability';
import { PostgresControlPlaneSignals, PostgresDatabase } from '@taskelith/postgres';
import { acceptAssignment } from '@taskelith/scheduling';
import { SimulatedHost, id, value } from '@taskelith/testing';
import { authorizedUnder, placedTask, seedWorker } from './capacity-fixtures.ts';
import { AT, assignment, command } from './fixtures.ts';
import {
  assertNoPassword, createMigratedDatabase, pinnedClockCredentials, query, sentinelCredentials, truncateAll,
} from './test-database.ts';

const url = await createMigratedDatabase();
const metrics = new InMemoryMetrics();
const sink = new InMemoryLogSink();
const observer = await sentinelCredentials(url);
const database = new PostgresDatabase(observer, { metrics, logger: new Logger(sink, new SimulatedHost(AT).wallClock) });
const signals = new PostgresControlPlaneSignals(database);
// The server's wall clock may step back between two transactions, so ages
// are asserted on a clock pinned at AT, the stamps written relative to it.
const pinnedDatabase = new PostgresDatabase(await pinnedClockCredentials(url, AT));
const pinnedSignals = new PostgresControlPlaneSignals(pinnedDatabase);
after(() => Promise.all([database.close(), pinnedDatabase.close()]));
beforeEach(() => truncateAll(url));

const EMPTY = {
  outboxLagSeconds: 0, outboxPending: 0, assignmentAgeSeconds: 0, offeredAssignments: 0, unknownExecutions: 0, eligibleSlots: 0, heldSlots: 0,
};

function worker(workerId: string, draining: boolean) {
  return {
    workerId: id('WorkerId', workerId) as WorkerId, enrolled: true, revoked: false, draining, reachable: true, slots: 2,
    cpuMillicores: 3500, memoryMebibytes: 7680, controls: [], protocolVersion: 1,
  };
}

for (const conformance of CONTROL_PLANE_SIGNALS_CONFORMANCE) {
  test(`PostgreSQL signals: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(signals), []);
  });
}

test('the snapshot reads outbox lag, assignment age, unknown executions, and capacity', async () => {
  await seedWorker(url, worker('worker-1', false));
  await seedWorker(url, worker('worker-2', true));
  const offered = assignment('assignment-1');
  const placed = placedTask('task-1', 'attempt-1');
  const authorized = authorizedUnder(placed, offered.id, offered.workerId);
  const report = { workerId: offered.workerId, executionId: authorized.attempts[0]!.executions[0]!.id };
  const uncertain = value(recordExecutionEvidence(authorized, { ...report, kind: 'uncertain' }, AT)).task;
  assert.ok((await database.transaction(async (tx) => {
    for (const write of [() => tx.assignments.add(offered), () => tx.tasks.add(uncertain), () => tx.outbox.append(command('offer-1'))]) {
      const written = await write();
      if (!written.ok) return written;
    }
    return tx.outbox.append(command('offer-2'));
  })).ok);
  await query(url, "UPDATE outbox SET appended_at = $1::timestamptz - interval '30 seconds'", [AT]);
  await query(url, "UPDATE assignments SET changed_at = $1::timestamptz - interval '90 seconds'", [AT]);
  assert.deepEqual(await pinnedSignals.read(), ok({
    ...EMPTY, outboxLagSeconds: 30, outboxPending: 2, assignmentAgeSeconds: 90, offeredAssignments: 1,
    unknownExecutions: 1, eligibleSlots: 2, heldSlots: 1,
  }));
});

test('an accepted assignment and a published row no longer count as waiting', async () => {
  const offered = assignment('assignment-1');
  const accepted = value(acceptAssignment(offered, offered.generation, offered.workerId, AT));
  assert.ok((await database.transaction(async (tx) => {
    const added = await tx.assignments.add(offered);
    if (!added.ok) return added;
    const appended = await tx.outbox.append(command('offer-1'));
    if (!appended.ok) return appended;
    return tx.assignments.replace(accepted, offered.generation);
  })).ok);
  assert.ok((await database.transaction((tx) => tx.outbox.markPublished(command('offer-1').metadata.eventId))).ok);
  assert.deepEqual(await signals.read(), ok({ ...EMPTY, heldSlots: 1 }));
});

test('outbox lag reads the oldest append, which need not be the lowest position', async () => {
  assert.ok((await database.transaction(async (tx) => {
    const first = await tx.outbox.append(command('offer-1'));
    return first.ok ? tx.outbox.append(command('offer-2')) : first;
  })).ok);
  await query(url, "UPDATE outbox SET appended_at = $1::timestamptz - interval '5 seconds' WHERE event_id = 'offer-1'", [AT]);
  await query(url, "UPDATE outbox SET appended_at = $1::timestamptz - interval '60 seconds' WHERE event_id = 'offer-2'", [AT]);
  assert.equal(value(await pinnedSignals.read()).outboxLagSeconds, 60);
});

test('a clock that stamped a row in the future never reads as a negative age', async () => {
  assert.ok((await database.transaction(async (tx) => {
    const added = await tx.assignments.add(assignment('assignment-1'));
    return added.ok ? tx.outbox.append(command('offer-1')) : added;
  })).ok);
  await query(url, "UPDATE outbox SET appended_at = now() + interval '1 hour'");
  await query(url, "UPDATE assignments SET changed_at = now() + interval '1 hour'");
  const read = value(await signals.read());
  assert.deepEqual([read.outboxLagSeconds, read.assignmentAgeSeconds], [0, 0]);
});

test('the snapshot reads in a read-only transaction, where a write is a defect', async () => {
  await assert.rejects(database.readOnly((tx) => tx.outbox.append(command('offer-1'))), /read-only transaction/);
  assert.deepEqual(await signals.read(), ok(EMPTY));
});

test('each transaction attempt is timed as database latency', async () => {
  const before = metrics.series('database.latency')?.count ?? 0;
  await signals.read();
  await signals.read();
  const latency = metrics.series('database.latency')!;
  assert.equal(latency.count, before + 2);
  assert.ok(latency.min >= 0 && latency.max < 10);
});

test('an idle connection that breaks is logged without the credentials', async () => {
  await signals.read();
  await query(url, 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()');
  for (let waited = 0; waited < 5000 && !sink.records.some((record) => record.event === 'postgres.connection.lost'); waited += 20) {
    await delay(20);
  }
  const lost = sink.records.find((record) => record.event === 'postgres.connection.lost');
  assert.equal(lost?.level, 'warn');
  assertNoPassword(JSON.stringify(sink.records), observer.password);
  assert.ok((await signals.read()).ok);
});
