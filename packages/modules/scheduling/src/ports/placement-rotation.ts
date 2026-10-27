import type { Result } from '@taskelith/kernel';
import type { ProjectId } from '../domain/capacity-reservation.js';

// The installation's rotation cursor (capacity reservation section 13),
// which survives a restart; the last `advance` wins.
export interface PlacementRotation {
  // None before the first move.
  read(): Promise<ProjectId | undefined>;
  advance(projectId: ProjectId): Promise<Result<void>>;
  // Stores `next` only while the cursor is still `expected`.
  advanceFrom(expected: ProjectId | undefined, next: ProjectId): Promise<Result<void>>;
}
