import { err, failure, ok, type EventId, type Result } from '@taskelith/kernel';
import type { AssignmentId, AttemptId, WorkerId } from '@taskelith/execution';
import { checkGeneration, checkNextGeneration, type Generation } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';
import type { AssignmentRepository } from '../ports/assignment-repository.js';
import { byCodeUnits } from '../domain/code-unit-order.js';
import type { ProviderCredentialId } from '../domain/capacity-reservation.js';

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
    const offer = this.#offerConflict(assignment);
    if (!offer.ok) return offer;
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
    const offer = offerIdentityConflict(stored, assignment);
    if (!offer.ok) return offer;
    const held = this.#heldReservationConflict(assignment);
    if (!held.ok) return held;
    this.#assignments.set(assignment.id, assignment);
    return ok(undefined);
  }

  async listByAttempt(attemptId: AttemptId): Promise<readonly Assignment[]> {
    return this.all().filter((assignment) => assignment.attemptId === attemptId).sort((left, right) => byCodeUnits(left.id, right.id));
  }

  async listUnfinishedByWorker(workerId: WorkerId): Promise<readonly Assignment[]> {
    return this.all()
      .filter((assignment) => assignment.workerId === workerId && assignment.state !== 'ended')
      .sort((left, right) => byCodeUnits(left.id, right.id));
  }

  async listHeldForCredential(credentialId: ProviderCredentialId): Promise<readonly Assignment[]> {
    return this.all()
      .filter(({ reservation }) => reservation.state === 'held' && reservation.providerCredentials.includes(credentialId))
      .sort((left, right) => byCodeUnits(left.id, right.id));
  }

  async byOfferCommand(commandId: EventId): Promise<Result<Assignment>> {
    const offered = this.all().find((assignment) => assignment.offerCommandId === commandId);
    if (offered === undefined) return err(failure('not-found', `no assignment was offered by ${commandId}`, { command: commandId }));
    return ok(offered);
  }

  // An offer's command offers one assignment, as the database's unique
  // column requires.
  #offerConflict(assignment: Assignment): Result<void> {
    const { offerCommandId } = assignment;
    if (offerCommandId === undefined || !this.all().some((other) => other.offerCommandId === offerCommandId)) return ok(undefined);
    return err(failure('conflict', `command ${offerCommandId} already offered another assignment`, { command: offerCommandId }));
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

// The command that offered an assignment is its lookup key, so a replace
// keeps it exactly: it can neither change it, set it, nor clear it.
function offerIdentityConflict(stored: Assignment, assignment: Assignment): Result<void> {
  if (stored.offerCommandId === assignment.offerCommandId) return ok(undefined);
  return err(failure('conflict', `assignment ${assignment.id} keeps the command that offered it`, { assignment: assignment.id }));
}
