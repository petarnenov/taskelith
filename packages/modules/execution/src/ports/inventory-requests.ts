import type { Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import type { InventoryRequest } from '../domain/inventory.js';

// The latest inventory request of each worker with its bound; saving one
// replaces the worker's earlier request.
export interface InventoryRequests {
  current(workerId: WorkerId): Promise<InventoryRequest | undefined>;
  save(request: InventoryRequest): Promise<Result<void>>;
}
