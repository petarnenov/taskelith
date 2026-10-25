import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok, parseInstant } from '@taskelith/kernel';
import {
  G2_SIGNALS,
  InMemoryLogSink,
  InMemoryMetrics,
  Logger,
  measurement,
  NO_METRICS,
  sampleControlPlane,
  type ControlPlaneSnapshot,
} from '@taskelith/observability';
import { SimulatedHost, value } from '@taskelith/testing';

const SNAPSHOT: ControlPlaneSnapshot = {
  outboxLagSeconds: 1.5,
  outboxPending: 3,
  assignmentAgeSeconds: 90,
  offeredAssignments: 2,
  unknownExecutions: 1,
  eligibleSlots: 8,
  heldSlots: 5,
};

test('the catalogue names every G2 signal of architecture section 12', () => {
  assert.deepEqual(Object.keys(G2_SIGNALS).sort(), [
    'assignment.age', 'assignment.offered', 'database.latency', 'event-loop.lag', 'execution.unknown',
    'inbox.lag', 'outbox.lag', 'outbox.pending', 'worker.capacity.held', 'worker.capacity.slots',
  ]);
});

test('a gauge keeps its last value', () => {
  const metrics = new InMemoryMetrics();
  metrics.record(measurement('outbox.lag', 4));
  metrics.record(measurement('outbox.lag', 2));
  assert.deepEqual(metrics.series('outbox.lag'), { signal: 'outbox.lag', labels: {}, count: 1, sum: 2, min: 2, max: 2, last: 2 });
});

test('a distribution summarizes every sample per label set', () => {
  const metrics = new InMemoryMetrics();
  metrics.record(measurement('inbox.lag', 0.5, { stream: 'commands', consumer: 'w' }));
  metrics.record(measurement('inbox.lag', 0.1, { consumer: 'w', stream: 'commands' }));
  metrics.record(measurement('inbox.lag', 0.3, { consumer: 'w', stream: 'commands' }));
  metrics.record(measurement('inbox.lag', 9, { stream: 'observations' }));
  const commands = metrics.series('inbox.lag', { stream: 'commands', consumer: 'w' });
  assert.equal(commands?.count, 3);
  assert.ok(Math.abs(commands.sum - 0.9) < 1e-9);
  assert.deepEqual([commands.min, commands.max, commands.last], [0.1, 0.5, 0.3]);
  assert.equal(metrics.snapshot().length, 2);
  assert.equal(metrics.series('inbox.lag'), undefined);
});

test('a sample records each control-plane signal', async () => {
  const metrics = new InMemoryMetrics();
  const sink = new InMemoryLogSink();
  await sampleControlPlane({ read: async () => ok(SNAPSHOT) }, metrics, new Logger(sink, clock()));
  const values = Object.fromEntries(metrics.snapshot().map((series) => [series.signal, series.last]));
  assert.deepEqual(values, {
    'outbox.lag': 1.5,
    'outbox.pending': 3,
    'assignment.age': 90,
    'assignment.offered': 2,
    'execution.unknown': 1,
    'worker.capacity.slots': 8,
    'worker.capacity.held': 5,
  });
  assert.deepEqual(sink.records, []);
});

test('a failed sample is logged and records nothing', async () => {
  const metrics = new InMemoryMetrics();
  const sink = new InMemoryLogSink();
  const unreachable = failure('unavailable', 'PostgreSQL is not reachable: postgres://u:p@db');
  await sampleControlPlane({ read: async () => err(unreachable) }, metrics, new Logger(sink, clock()));
  assert.deepEqual(metrics.snapshot(), []);
  assert.equal(sink.records[0]?.event, 'observability.sample.failed');
  assert.deepEqual(sink.records[0]?.fields, { code: 'unavailable', message: 'PostgreSQL is not reachable: postgres://[redacted]@db' });
});

test('the discarding metrics accept a measurement', () => {
  NO_METRICS.record(measurement('database.latency', 0.01));
});

function clock() {
  return new SimulatedHost(value(parseInstant('2026-10-25T10:00:00.000Z'))).wallClock;
}
