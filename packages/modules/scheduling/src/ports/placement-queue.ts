import type { TaskId } from '@taskelith/sdlc';
import type { WaitingPlacement } from '../domain/fair-order.js';

// The tasks that wait for placement and whose active attempt holds no
// reservation, oldest first, each with the project of its lineage.
export interface PlacementQueue {
  waiting(limit: number): Promise<readonly WaitingPlacement<TaskId>[]>;
}
