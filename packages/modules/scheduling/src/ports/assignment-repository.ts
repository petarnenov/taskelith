import type { Result } from '@taskelith/kernel';
import type { AssignmentId, AttemptId } from '@taskelith/execution';
import type { Generation } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';

// Stores assignments with their reservations; writes fail with `conflict` on
// a stale generation or a second held reservation of one attempt.
export interface AssignmentRepository {
  get(id: AssignmentId): Promise<Result<Assignment>>;
  add(assignment: Assignment): Promise<Result<void>>;
  replace(assignment: Assignment, expectedGeneration: Generation): Promise<Result<void>>;
  // Every assignment of the attempt, held or not, by identity.
  listByAttempt(attemptId: AttemptId): Promise<readonly Assignment[]>;
}
