import assert from 'node:assert/strict';
import test from 'node:test';
import { requestStartInventories } from '@taskelith/control-plane';
import type { WorkerId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';

function logged(): { sink: InMemoryLogSink; logger: Logger } {
  const sink = new InMemoryLogSink();
  return { sink, logger: new Logger(sink, { now: () => '2026-10-25T09:00:00.000Z' as never }) };
}

test('a start requests the inventory of the active workers the registry lists', async () => {
  const { sink, logger } = logged();
  const requested: (readonly WorkerId[])[] = [];
  const registry = { activeWorkerIds: async (): Promise<Result<readonly WorkerId[]>> => ok(['w1', 'w2'] as WorkerId[]) };
  const inventory = {
    requestAll: async (workerIds: readonly WorkerId[]) => {
      requested.push(workerIds);
      return { sent: workerIds.length, failed: 0 };
    },
  };
  await requestStartInventories(registry, inventory, logger);
  assert.deepEqual(requested, [['w1', 'w2']]);
  assert.deepEqual(sink.records, []);
});

test('a registry that cannot list the workers is logged and requests nothing', async () => {
  const { sink, logger } = logged();
  const registry = { activeWorkerIds: async (): Promise<Result<readonly WorkerId[]>> => err(failure('unavailable', 'no database')) };
  await requestStartInventories(registry, { requestAll: async () => assert.fail('nothing to request') }, logger);
  assert.deepEqual(sink.records.map((record) => record.event), ['execution.inventory-requests.unlisted']);
});
