import type { TaskId } from '@taskelith/sdlc';
import type { WaitingPlacement } from '../domain/fair-order.js';

// Waiting tasks whose active attempt holds no reservation, with their
// project: by rank within the project, then oldest first, before the limit.
export interface PlacementQueue {
  waiting(limit: number): Promise<readonly WaitingPlacement<TaskId>[]>;
}
