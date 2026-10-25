import type { TaskId } from '@taskelith/sdlc';
import type { ProjectId } from '../domain/capacity-reservation.js';
import type { WaitingPlacement } from '../domain/fair-order.js';

// Linked waiting tasks whose active attempt holds no reservation. Excluded
// tasks are left out before the ranking and the limit.
export interface PlacementQueue {
  // Rank in project, then projects after `after` first, wrapping: passing
  // the last project read reaches each of P projects in ceil(P/limit) reads.
  waiting(limit: number, excluding: readonly TaskId[], after: ProjectId | undefined): Promise<readonly WaitingPlacement<TaskId>[]>;
  // Those of the given tasks that still wait, in id order.
  stillWaiting(taskIds: readonly TaskId[]): Promise<readonly TaskId[]>;
}
