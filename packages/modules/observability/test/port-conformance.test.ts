import assert from 'node:assert/strict';
import test from 'node:test';
import { ok } from '@taskelith/kernel';
import {
  CONTROL_PLANE_SIGNALS_CONFORMANCE,
  InMemoryLogSink,
  InMemoryMetrics,
  LOG_SINK_CONFORMANCE,
  METRICS_CONFORMANCE,
  NO_LOGS,
  NO_METRICS,
  type ControlPlaneSnapshot,
} from '@taskelith/observability';
import type { ConformanceCase } from '@taskelith/sdlc';

function runSuite<Port>(adapter: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`${adapter}: ${conformance.name}`, async () => {
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('in-memory log sink', LOG_SINK_CONFORMANCE, () => new InMemoryLogSink());
runSuite('discarding log sink', LOG_SINK_CONFORMANCE, () => NO_LOGS);
runSuite('in-memory metrics', METRICS_CONFORMANCE, () => new InMemoryMetrics());
runSuite('discarding metrics', METRICS_CONFORMANCE, () => NO_METRICS);

test('the suites report what a port gets wrong', async () => {
  const throwing = { write: () => { throw new Error('closed'); }, record: () => { throw new Error('closed'); } };
  assert.equal((await LOG_SINK_CONFORMANCE[0]!.check(throwing)).length, 4);
  assert.match((await METRICS_CONFORMANCE[0]!.check(throwing))[0]!, /outbox.lag: threw closed/);
  const busy: ControlPlaneSnapshot = {
    outboxLagSeconds: 1, outboxPending: 1, assignmentAgeSeconds: 0, offeredAssignments: 0, unknownExecutions: 0, eligibleSlots: 0, heldSlots: 0,
  };
  assert.equal((await CONTROL_PLANE_SIGNALS_CONFORMANCE[0]!.check({ read: async () => ok(busy) })).length, 1);
  const failing = { read: async () => ({ ok: false as const, error: { code: 'unavailable' as const, message: 'down', details: {} } }) };
  assert.deepEqual(await CONTROL_PLANE_SIGNALS_CONFORMANCE[0]!.check(failing), ['read: expected success, got down']);
});
