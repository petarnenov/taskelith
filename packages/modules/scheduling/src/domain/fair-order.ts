import type { Instant } from '@taskelith/kernel';
import type { ProjectId } from './capacity-reservation.js';
import { byCodeUnits } from './code-unit-order.js';

export interface WaitingPlacement<Item> {
  readonly projectId: ProjectId;
  readonly waitingSince: Instant;
  readonly item: Item;
}

// The items of `fairWaitingOrder`, in the order capacity is offered.
export function fairPlacementOrder<Item extends string>(
  waiting: readonly WaitingPlacement<Item>[], after: ProjectId | undefined,
): readonly Item[] {
  return fairWaitingOrder(waiting, after).map((entry) => entry.item);
}

// Rounds of each project's next oldest task, each from the projects after
// `after`, then wrapped, by id, as the waiting read (contract section 5).
export function fairWaitingOrder<Item extends string>(
  waiting: readonly WaitingPlacement<Item>[], after: ProjectId | undefined,
): readonly WaitingPlacement<Item>[] {
  const rank = ranksWithinProject(waiting);
  const wrapped = (entry: WaitingPlacement<Item>) => (after !== undefined && byCodeUnits(entry.projectId, after) <= 0 ? 1 : 0);
  return [...waiting].sort((left, right) => rank.get(left)! - rank.get(right)!
    || wrapped(left) - wrapped(right) || byCodeUnits(left.projectId, right.projectId) || byWaitingSince(left, right));
}

// Contract section 13: one event per offer; the offers after the first that
// lacked fleet capacity do not move it.
export class RotationCursor {
  readonly #start: ProjectId | undefined;
  #lastDeclined: ProjectId | undefined;
  #lastPlaced: ProjectId | undefined;
  #capacityRanOut = false;

  constructor(start: ProjectId | undefined) {
    this.#start = start;
  }

  placed(projectId: ProjectId): void {
    if (!this.#capacityRanOut) this.#lastPlaced = projectId;
  }

  declined(projectId: ProjectId): void {
    if (!this.#capacityRanOut) this.#lastDeclined = projectId;
  }

  ranOutOfCapacity(): void {
    this.#capacityRanOut = true;
  }

  // Whether the next offer would still move it.
  get moving(): boolean {
    return !this.#capacityRanOut;
  }

  get next(): ProjectId | undefined {
    return this.#lastPlaced ?? this.#lastDeclined ?? this.#start;
  }
}

function ranksWithinProject<Item extends string>(waiting: readonly WaitingPlacement<Item>[]): Map<WaitingPlacement<Item>, number> {
  const ranks = new Map<WaitingPlacement<Item>, number>();
  const counts = new Map<ProjectId, number>();
  for (const entry of [...waiting].sort(byWaitingSince)) {
    const rank = (counts.get(entry.projectId) ?? 0) + 1;
    counts.set(entry.projectId, rank);
    ranks.set(entry, rank);
  }
  return ranks;
}

function byWaitingSince<Item extends string>(left: WaitingPlacement<Item>, right: WaitingPlacement<Item>): number {
  return Date.parse(left.waitingSince) - Date.parse(right.waitingSince)
    || byCodeUnits(left.projectId, right.projectId) || byCodeUnits(left.item, right.item);
}
