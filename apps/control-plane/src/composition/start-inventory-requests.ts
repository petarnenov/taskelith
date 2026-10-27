import type { FleetRegistry } from '@taskelith/fleet';
import type { Logger } from '@taskelith/observability';
import type { InventoryService } from '../application/inventory-service.js';

// Requests the inventory of every active worker once at start (21c decision
// 4 b); each failure and the summary are logged by the service, not retried.
export async function requestStartInventories(
  registry: Pick<FleetRegistry, 'activeWorkerIds'>,
  inventory: Pick<InventoryService, 'requestAll'>,
  logger: Logger,
): Promise<void> {
  const workers = await registry.activeWorkerIds();
  if (!workers.ok) {
    logger.warn('execution.inventory-requests.unlisted', { code: workers.error.code, message: workers.error.message });
    return;
  }
  await inventory.requestAll(workers.value);
}
