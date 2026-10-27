import { err, failure, ok, type Result } from '@taskelith/kernel';
import { activeAttempt, placementNeed, type Task } from '@taskelith/execution';
import { checkGeneration, checkNextGeneration, type Generation, type TaskId } from '@taskelith/sdlc';
import type { Assignment } from '../domain/assignment.js';
import type { ProjectId } from '../domain/capacity-reservation.js';
import type { DelegationId, DelegationRecord } from '../domain/delegation-request.js';
import type { WaitingPlacement } from '../domain/fair-order.js';
import type { DelegationRequests } from '../ports/delegation-requests.js';
import type { PlacementQueue } from '../ports/placement-queue.js';
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
    return Object.freeze(rankedByProject(waiting, after).slice(0, limit));
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

// As the database queue: each task's rank within its project, oldest first,
// then the projects after `after` first, wrapping, order it before the limit.
function rankedByProject(waiting: readonly WaitingPlacement<TaskId>[], after: ProjectId | undefined): WaitingPlacement<TaskId>[] {
  const ranks = new Map<WaitingPlacement<TaskId>, number>();
  const counts = new Map<string, number>();
  for (const entry of [...waiting].sort(byWaitingSince)) {
    const rank = (counts.get(entry.projectId) ?? 0) + 1;
    counts.set(entry.projectId, rank);
    ranks.set(entry, rank);
  }
  const wrapped = (entry: WaitingPlacement<TaskId>) => (after !== undefined && byCodeUnits(entry.projectId, after) <= 0 ? 1 : 0);
  return [...waiting].sort((left, right) => ranks.get(left)! - ranks.get(right)! || wrapped(left) - wrapped(right)
    || byCodeUnits(left.projectId, right.projectId) || byWaitingSince(left, right));
}

function byWaitingSince(left: WaitingPlacement<TaskId>, right: WaitingPlacement<TaskId>): number {
  return Date.parse(left.waitingSince) - Date.parse(right.waitingSince)
    || byCodeUnits(left.projectId, right.projectId) || byCodeUnits(left.item, right.item);
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
