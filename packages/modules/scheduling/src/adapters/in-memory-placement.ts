import { err, failure, ok, type Result } from '@taskelith/kernel';
import { activeAttempt, placementNeed, type Task } from '@taskelith/execution';
import { checkGeneration, checkNextGeneration, type Generation, type TaskId } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';
import type { ProjectId } from '../domain/capacity-reservation.js';
import type { DelegationId, DelegationRecord } from '../domain/delegation-request.js';
import { fairWaitingOrder, type WaitingPlacement } from '../domain/fair-order.js';
import type { PlacementOutcomeRecord } from '../domain/placement-outcome-record.js';
import type { DelegationRequests } from '../ports/delegation-requests.js';
import type { PlacementOutcomeRecords } from '../ports/placement-outcome-records.js';
import type { PlacementQueue } from '../ports/placement-queue.js';
import type { PlacementRotation } from '../ports/placement-rotation.js';
import type { TaskLineage } from '../ports/task-lineage.js';
import { byCodeUnits } from '../domain/code-unit-order.js';

// Reads the waiting tasks from task, lineage, and assignment stores, as the
// database queue does with its query columns.
export class InMemoryPlacementQueue implements PlacementQueue {
  readonly #tasks: () => readonly Task[];
  readonly #lineage: TaskLineage;
  readonly #assignments: () => readonly Assignment[];

  constructor(tasks: () => readonly Task[], lineage: TaskLineage, assignments: () => readonly Assignment[]) {
    this.#tasks = tasks;
    this.#lineage = lineage;
    this.#assignments = assignments;
  }

  async waiting(limit: number, excluding: readonly TaskId[], after: ProjectId | undefined): Promise<readonly WaitingPlacement<TaskId>[]> {
    const excluded = new Set(excluding);
    const waiting = await this.#linkedWaiting((task) => !excluded.has(task.id));
    return Object.freeze(fairWaitingOrder(waiting, after).slice(0, limit));
  }

  async stillWaiting(taskIds: readonly TaskId[]): Promise<readonly TaskId[]> {
    const asked = new Set(taskIds);
    const waiting = await this.#linkedWaiting((task) => asked.has(task.id));
    return Object.freeze(waiting.map((entry) => entry.item).sort(byCodeUnits));
  }

  async #linkedWaiting(selected: (task: Task) => boolean): Promise<WaitingPlacement<TaskId>[]> {
    const waiting: WaitingPlacement<TaskId>[] = [];
    for (const task of this.#tasks().filter((candidate) => selected(candidate) && this.#waits(candidate))) {
      const link = await this.#lineage.get(task.id);
      if (link !== undefined) waiting.push(Object.freeze({ projectId: link.projectId, waitingSince: task.changedAt, item: task.id }));
    }
    return waiting;
  }

  #waits(task: Task): boolean {
    const attemptId = activeAttempt(task)?.id;
    const held = this.#assignments().some((assignment) => assignment.attemptId === attemptId && assignment.reservation.state === 'held');
    return placementNeed(task) !== undefined && !held;
  }
}

// One installation's cursor, kept for every service over the same store.
export class InMemoryPlacementRotation implements PlacementRotation {
  #cursor: ProjectId | undefined;

  async read(): Promise<ProjectId | undefined> {
    return this.#cursor;
  }

  async advance(projectId: ProjectId): Promise<Result<void>> {
    this.#cursor = projectId;
    return ok(undefined);
  }

  async advanceFrom(expected: ProjectId | undefined, next: ProjectId): Promise<Result<void>> {
    if (this.#cursor === expected) this.#cursor = next;
    return ok(undefined);
  }
}

// Each task's record as written, kept for every service over one store.
export class InMemoryPlacementOutcomeRecords implements PlacementOutcomeRecords {
  readonly #records = new Map<TaskId, PlacementOutcomeRecord>();

  async record(outcome: PlacementOutcomeRecord): Promise<Result<void>> {
    this.#records.set(outcome.taskId, Object.freeze({ ...outcome }));
    return ok(undefined);
  }

  async remove(taskId: TaskId): Promise<Result<void>> {
    this.#records.delete(taskId);
    return ok(undefined);
  }

  async get(taskId: TaskId): Promise<PlacementOutcomeRecord | undefined> {
    return this.#records.get(taskId);
  }

  async list(taskIds: readonly TaskId[]): Promise<readonly PlacementOutcomeRecord[]> {
    const asked = [...new Set(taskIds)].sort(byCodeUnits);
    return Object.freeze(asked.flatMap((taskId) => this.#records.get(taskId) ?? []));
  }
}

// Checks and writes without awaiting, so concurrent writers cannot both
// pass a check.
export class InMemoryDelegationRequests implements DelegationRequests {
  readonly #records = new Map<DelegationId, DelegationRecord>();

  async get(delegationId: DelegationId): Promise<Result<DelegationRecord>> {
    const record = this.#records.get(delegationId);
    if (record === undefined) return notFound(delegationId);
    return ok(record);
  }

  async add(record: DelegationRecord): Promise<Result<void>> {
    if (this.#records.has(record.delegationId)) {
      return err(failure('conflict', `delegation ${record.delegationId} already exists`, { delegation: record.delegationId }));
    }
    this.#records.set(record.delegationId, record);
    return ok(undefined);
  }

  async replace(record: DelegationRecord, expectedGeneration: Generation): Promise<Result<void>> {
    const stored = this.#records.get(record.delegationId);
    if (stored === undefined) return notFound(record.delegationId);
    const entity = `delegation ${record.delegationId}`;
    const generation = checkGeneration(entity, stored.generation, expectedGeneration);
    if (!generation.ok) return generation;
    const next = checkNextGeneration(entity, record.generation, expectedGeneration);
    if (!next.ok) return next;
    this.#records.set(record.delegationId, record);
    return ok(undefined);
  }
}

function notFound(delegationId: DelegationId): Result<never> {
  return err(failure('not-found', `delegation ${delegationId} does not exist`, { delegation: delegationId }));
}
