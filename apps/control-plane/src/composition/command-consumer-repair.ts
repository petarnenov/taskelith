import type { WorkerId } from '@taskelith/execution';
import type { FleetRegistry, WorkerCommandConsumers } from '@taskelith/fleet';
import type { Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';

// Provisional G2 value in docs/operational-targets.md, which G6 verifies.
export const REVOKED_CONSUMER_REMOVALS_PER_START = 100;

// Ensures the consumer of every active worker and removes those of the
// latest revoked ones once, so a start heals; failures are logged only.
export async function repairCommandConsumers(
  registry: Pick<FleetRegistry, 'activeWorkerIds' | 'recentlyRevokedWorkerIds'>,
  consumers: WorkerCommandConsumers,
  logger: Logger,
): Promise<void> {
  await eachWorker(registry.activeWorkerIds(), (workerId) => consumers.ensure(workerId), {
    logger, failed: 'fleet.command-consumer.failed', done: 'fleet.command-consumers.repaired',
  });
  await eachWorker(registry.recentlyRevokedWorkerIds(REVOKED_CONSUMER_REMOVALS_PER_START), (workerId) => consumers.remove(workerId), {
    logger, failed: 'fleet.command-consumer.unremoved', done: 'fleet.command-consumers.removed',
  });
}

interface RepairEvents {
  readonly logger: Logger;
  readonly failed: string;
  readonly done: string;
}

async function eachWorker(
  listed: Promise<Result<readonly WorkerId[]>>,
  repair: (workerId: WorkerId) => Promise<Result<void>>,
  events: RepairEvents,
): Promise<void> {
  const workers = await listed;
  if (!workers.ok) {
    events.logger.warn('fleet.command-consumers.unlisted', { code: workers.error.code, message: workers.error.message });
    return;
  }
  let failed = 0;
  for (const workerId of workers.value) {
    const repaired = await repair(workerId);
    if (repaired.ok) continue;
    failed += 1;
    events.logger.warn(events.failed, { workerId, code: repaired.error.code, message: repaired.error.message });
  }
  events.logger.info(events.done, { workers: workers.value.length, failed });
}
