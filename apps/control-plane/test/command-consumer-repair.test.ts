import assert from 'node:assert/strict';
import test from 'node:test';
import { repairCommandConsumers, REVOKED_CONSUMER_REMOVALS_PER_START } from '@taskelith/control-plane';
import type { WorkerId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';

function logged(): { sink: InMemoryLogSink; logger: Logger } {
  const sink = new InMemoryLogSink();
  return { sink, logger: new Logger(sink, { now: () => '2026-10-25T09:00:00.000Z' as never }) };
}

type Listed = Promise<Result<readonly WorkerId[]>>;

function registry(active: string[], revoked: string[] = []) {
  const limits: number[] = [];
  return {
    limits,
    activeWorkerIds: async (): Listed => ok(active as WorkerId[]),
    recentlyRevokedWorkerIds: async (limit: number): Listed => {
      limits.push(limit);
      return ok(revoked as WorkerId[]);
    },
  };
}

class RecordingConsumers {
  readonly ensured: string[] = [];
  readonly removed: string[] = [];
  readonly refused = new Set<string>();

  async ensure(workerId: WorkerId): Promise<Result<void>> {
    this.ensured.push(workerId);
    return this.#outcome(workerId);
  }

  async remove(workerId: WorkerId): Promise<Result<void>> {
    this.removed.push(workerId);
    return this.#outcome(workerId);
  }

  #outcome(workerId: WorkerId): Result<void> {
    return this.refused.has(workerId) ? err(failure('unavailable', 'the broker is down')) : ok(undefined);
  }
}

const events = (sink: InMemoryLogSink) => sink.records.map((record) => record.event);

test('a start ensures every active worker consumer and logs a failure without stopping', async () => {
  const { sink, logger } = logged();
  const consumers = new RecordingConsumers();
  consumers.refused.add('w2');
  await repairCommandConsumers(registry(['w1', 'w2', 'w3']), consumers, logger);
  assert.deepEqual(consumers.ensured, ['w1', 'w2', 'w3']);
  assert.deepEqual(events(sink), ['fleet.command-consumer.failed', 'fleet.command-consumers.repaired', 'fleet.command-consumers.removed']);
  assert.deepEqual(sink.records[1]?.fields, { workers: 3, failed: 1 });
});

test('a start removes the latest revoked workers consumers and leaves the active ones', async () => {
  const { sink, logger } = logged();
  const consumers = new RecordingConsumers();
  consumers.refused.add('r2');
  const fleet = registry(['w1'], ['r1', 'r2', 'r3']);
  await repairCommandConsumers(fleet, consumers, logger);
  assert.deepEqual(fleet.limits, [REVOKED_CONSUMER_REMOVALS_PER_START]);
  assert.deepEqual([consumers.ensured, consumers.removed], [['w1'], ['r1', 'r2', 'r3']]);
  assert.deepEqual(events(sink), ['fleet.command-consumers.repaired', 'fleet.command-consumer.unremoved', 'fleet.command-consumers.removed']);
  assert.deepEqual(sink.records[1]?.fields, { workerId: 'r2', code: 'unavailable', message: 'the broker is down' });
  assert.deepEqual(sink.records[2]?.fields, { workers: 3, failed: 1 });
});

test('a registry that cannot list the workers is logged and repairs nothing', async () => {
  const { sink, logger } = logged();
  const down = async (): Listed => err(failure('unavailable', 'no database'));
  const consumers = new RecordingConsumers();
  await repairCommandConsumers({ activeWorkerIds: down, recentlyRevokedWorkerIds: down }, consumers, logger);
  assert.deepEqual([consumers.ensured, consumers.removed], [[], []]);
  assert.deepEqual(events(sink), ['fleet.command-consumers.unlisted', 'fleet.command-consumers.unlisted']);
});
