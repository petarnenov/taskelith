import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HeartbeatService,
  LostContactCheck,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
  type HeartbeatMessage,
} from '@taskelith/control-plane';
import { InMemoryTaskRepository, type WorkerId } from '@taskelith/execution';
import { fleetWorker, type EnrolledWorker } from '@taskelith/fleet';
import { instantFromEpochMilliseconds, ok, type Instant } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { InMemoryTaskLineage, type WorkerPlacementRecord } from '@taskelith/scheduling';
import { failed, SimulatedHost, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';

const JOURNAL = 'journal-1';
const START = Date.parse('2026-10-26T09:00:00.000Z');
const TIMEOUT = 30_000;

const after = (milliseconds: number): Instant => value(instantFromEpochMilliseconds(START + milliseconds));

function record(workerId: string): WorkerPlacementRecord {
  return {
    workerId: workerId as WorkerId, enrolled: true, revoked: false, draining: false, reachable: false, slots: 2, cpuMillicores: 4000,
    memoryMebibytes: 8192, controls: [], protocolVersion: 1,
  };
}

// Only the members these services use; the database time is the clock.
function fixture(enrolled: readonly EnrolledWorker[] = [fleetWorker('worker-1', JOURNAL), fleetWorker('worker-2', JOURNAL)]) {
  const clock = { now: after(0) };
  const capacity = inMemoryCapacity(new InMemoryTaskRepository(), new InMemoryTaskLineage(), enrolled.map((worker) => record(worker.workerId)));
  const transaction = {
    ...capacity,
    fleet: { worker: async (workerId: WorkerId) => ok(enrolled.find((worker) => worker.workerId === workerId)) },
    now: async () => clock.now,
  } as unknown as ControlPlaneTransaction;
  const store: ControlPlaneStore = { transaction: (work) => work(transaction), readCommitted: (work) => work(transaction) };
  const sink = new InMemoryLogSink();
  const logger = new Logger(sink, new SimulatedHost(after(0)).wallClock);
  const reachable = async (workerId: string) => (await capacity.workers.get(workerId as WorkerId))?.reachable;
  return {
    clock, sink, reachable, workers: capacity.workers, heartbeats: new HeartbeatService(store),
    check: (batch?: number) => new LostContactCheck(store, { timeoutMilliseconds: TIMEOUT, logger, ...(batch === undefined ? {} : { batch }) }),
  };
}

function heartbeat(workerId: string, overrides: Partial<{ subjectWorkerId: string; journalId: string }> = {}): HeartbeatMessage {
  return {
    subjectWorkerId: overrides.subjectWorkerId ?? workerId,
    body: { messageType: 'worker.heartbeat', schemaVersion: 1, protocolVersion: 1, workerId, journalId: overrides.journalId ?? JOURNAL, sentAt: after(0) },
  };
}

test('an authenticated heartbeat makes the worker reachable at the database time', async () => {
  const { clock, heartbeats, workers } = fixture();
  clock.now = after(5_000);
  value(await heartbeats.record(heartbeat('worker-1')));
  const worker = await workers.get('worker-1' as WorkerId);
  assert.deepEqual([worker?.reachable, worker?.lastContactAt], [true, after(5_000)]);
});

test('a heartbeat on another worker\'s subject, of another journal, a revoked or an unknown worker records no contact', async () => {
  const { heartbeats, reachable } = fixture([fleetWorker('worker-1', JOURNAL), fleetWorker('worker-2', JOURNAL, { revokedAt: after(0) })]);
  for (const refused of [
    heartbeat('worker-1', { subjectWorkerId: 'worker-2' }),
    { ...heartbeat('worker-1'), subjectWorkerId: undefined },
    heartbeat('worker-1', { journalId: 'journal-2' }),
    heartbeat('worker-2'),
    heartbeat('worker-3'),
  ]) {
    assert.equal(failed(await heartbeats.record(refused)).code, 'forbidden', JSON.stringify(refused));
  }
  assert.deepEqual([await reachable('worker-1'), await reachable('worker-2')], [false, false]);
});

test('a worker without contact for the timeout becomes unreachable, and contact again makes it reachable', async () => {
  const { clock, heartbeats, check, reachable, sink } = fixture();
  value(await heartbeats.record(heartbeat('worker-1')));
  clock.now = after(TIMEOUT);
  assert.deepEqual(value(await check().markLost()), [], 'not before the timeout has passed');
  assert.equal(await reachable('worker-1'), true);

  clock.now = after(TIMEOUT + 1);
  assert.deepEqual(value(await check().markLost()), ['worker-1']);
  assert.equal(await reachable('worker-1'), false);
  assert.deepEqual(sink.records.map(({ level, event, correlation }) => ({ level, event, correlation })), [
    { level: 'warn', event: 'fleet.worker.contact-lost', correlation: { workerId: 'worker-1' } },
  ]);

  value(await heartbeats.record(heartbeat('worker-1')));
  assert.equal(await reachable('worker-1'), true);
  assert.deepEqual(value(await check().markLost()), []);
});

test('a check marks at most its batch, oldest contact first, and the next one the rest', async () => {
  const { clock, heartbeats, check, reachable } = fixture();
  clock.now = after(1_000);
  value(await heartbeats.record(heartbeat('worker-2')));
  clock.now = after(2_000);
  value(await heartbeats.record(heartbeat('worker-1')));
  clock.now = after(TIMEOUT + 5_000);
  assert.deepEqual(value(await check(1).markLost()), ['worker-2']);
  assert.deepEqual([await reachable('worker-1'), await reachable('worker-2')], [true, false]);
  assert.deepEqual(value(await check(1).markLost()), ['worker-1']);
});
