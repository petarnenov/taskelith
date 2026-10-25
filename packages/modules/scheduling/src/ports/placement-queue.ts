import type { TaskId } from '@taskelith/sdlc';
import type { WaitingPlacement } from '../domain/fair-order.js';

// Waiting tasks whose active attempt holds no reservation, with their
// project: by rank within the project, then oldest first, before the limit.
export interface PlacementQueue {
  // Leaves out the excluded tasks before the ranking and the limit, so the
  // tasks that back off do not take the places of the tasks after them.
  waiting(limit: number, excluding: readonly TaskId[]): Promise<readonly WaitingPlacement<TaskId>[]>;
}
