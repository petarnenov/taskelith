import type { FleetRegistry, WorkerCommandConsumers } from '@taskelith/fleet';
import type { Logger } from '@taskelith/observability';

// Ensures the consumer of every active worker once, so one lost to a crash
// or a broker reset heals on restart; a failure is logged, not retried.
export async function repairCommandConsumers(
  registry: Pick<FleetRegistry, 'activeWorkerIds'>,
  consumers: WorkerCommandConsumers,
  logger: Logger,
): Promise<void> {
  const workers = await registry.activeWorkerIds();
  if (!workers.ok) {
    logger.warn('fleet.command-consumers.unlisted', { code: workers.error.code, message: workers.error.message });
    return;
  }
  let failed = 0;
  for (const workerId of workers.value) {
    const ensured = await consumers.ensure(workerId);
    if (ensured.ok) continue;
    failed += 1;
    logger.warn('fleet.command-consumer.failed', { workerId, code: ensured.error.code, message: ensured.error.message });
  }
  logger.info('fleet.command-consumers.repaired', { workers: workers.value.length, failed });
}
