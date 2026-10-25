import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AssignmentId } from '@taskelith/execution';
import { checkGeneration, checkNextGeneration, type Generation } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';
import type { AssignmentRepository } from '../ports/assignment-repository.js';

// Keeps assignments in process memory; it checks and writes without
// awaiting, so concurrent writers cannot both pass a check.
export class InMemoryAssignmentRepository implements AssignmentRepository {
  readonly #assignments = new Map<AssignmentId, Assignment>();

  // Every stored assignment, for the in-memory capacity ledger.
  all(): readonly Assignment[] {
    return [...this.#assignments.values()];
  }

  async get(id: AssignmentId): Promise<Result<Assignment>> {
    const assignment = this.#assignments.get(id);
    if (assignment === undefined) return err(failure('not-found', `assignment ${id} does not exist`, { assignment: id }));
    return ok(assignment);
  }

  async add(assignment: Assignment): Promise<Result<void>> {
    if (this.#assignments.has(assignment.id)) {
      return err(failure('conflict', `assignment ${assignment.id} already exists`, { assignment: assignment.id }));
    }
    const held = this.#heldReservationConflict(assignment);
    if (!held.ok) return held;
    this.#assignments.set(assignment.id, assignment);
    return ok(undefined);
  }

  async replace(assignment: Assignment, expectedGeneration: Generation): Promise<Result<void>> {
    const stored = this.#assignments.get(assignment.id);
    if (stored === undefined) return err(failure('not-found', `assignment ${assignment.id} does not exist`, { assignment: assignment.id }));
    const generation = checkGeneration(`assignment ${assignment.id}`, stored.generation, expectedGeneration);
    if (!generation.ok) return generation;
    const next = checkNextGeneration(`assignment ${assignment.id}`, assignment.generation, expectedGeneration);
    if (!next.ok) return next;
    const held = this.#heldReservationConflict(assignment);
    if (!held.ok) return held;
    this.#assignments.set(assignment.id, assignment);
    return ok(undefined);
  }

  #heldReservationConflict(assignment: Assignment): Result<void> {
    if (assignment.reservation.state !== 'held') return ok(undefined);
    const holder = [...this.#assignments.values()].find((other) =>
      other.id !== assignment.id && other.attemptId === assignment.attemptId && other.reservation.state === 'held');
    if (holder === undefined) return ok(undefined);
    return err(failure('conflict', `attempt ${assignment.attemptId} already holds a reservation through ${holder.id}`, {
      attempt: assignment.attemptId, assignment: holder.id,
    }));
  }
}
