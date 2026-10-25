import assert from 'node:assert/strict';
import test from 'node:test';
import { repairCommandConsumers } from '@taskelith/control-plane';
import type { WorkerId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';

function logged(): { sink: InMemoryLogSink; logger: Logger } {
  const sink = new InMemoryLogSink();
  return { sink, logger: new Logger(sink, { now: () => '2026-10-25T09:00:00.000Z' as never }) };
}

const workers = (...ids: string[]) => ({ activeWorkerIds: async (): Promise<Result<readonly WorkerId[]>> => ok(ids as WorkerId[]) });

test('a start ensures every active worker consumer and logs a failure without stopping', async () => {
  const { sink, logger } = logged();
  const ensured: string[] = [];
  const consumers = {
    ensure: async (workerId: WorkerId) => {
      ensured.push(workerId);
      return workerId === 'w2' ? err(failure('unavailable', 'the broker is down')) : ok(undefined);
    },
  };
  await repairCommandConsumers(workers('w1', 'w2', 'w3'), consumers, logger);
  assert.deepEqual(ensured, ['w1', 'w2', 'w3']);
  assert.deepEqual(sink.records.map((record) => record.event), ['fleet.command-consumer.failed', 'fleet.command-consumers.repaired']);
  assert.deepEqual(sink.records.at(-1)?.fields, { workers: 3, failed: 1 });
});

test('a registry that cannot list the workers is logged and ensures nothing', async () => {
  const { sink, logger } = logged();
  const registry = { activeWorkerIds: async (): Promise<Result<readonly WorkerId[]>> => err(failure('unavailable', 'no database')) };
  await repairCommandConsumers(registry, { ensure: async () => assert.fail('nothing to ensure') }, logger);
  assert.deepEqual(sink.records.map((record) => record.event), ['fleet.command-consumers.unlisted']);
});
