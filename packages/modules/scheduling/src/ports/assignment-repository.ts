import type { EventId, Result } from '@taskelith/kernel';
import type { AssignmentId, AttemptId, WorkerId } from '@taskelith/execution';
import type { Generation } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';

// Stores assignments with their reservations; writes fail with `conflict` on
// a stale generation or a second held reservation of one attempt.
export interface AssignmentRepository {
  get(id: AssignmentId): Promise<Result<Assignment>>;
  add(assignment: Assignment): Promise<Result<void>>;
  replace(assignment: Assignment, expectedGeneration: Generation): Promise<Result<void>>;
  // Every assignment of the attempt, held or not, in no specified order.
  listByAttempt(attemptId: AttemptId): Promise<readonly Assignment[]>;
  // The worker's assignments that have not ended, in identifier order.
  listUnfinishedByWorker(workerId: WorkerId): Promise<readonly Assignment[]>;
  // The assignment that the command offered; `not-found` for any other.
  byOfferCommand(commandId: EventId): Promise<Result<Assignment>>;
}
