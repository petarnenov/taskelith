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

// Contract section 13: after the project that last received capacity, else
// the last one offered before the fleet ran out of it, else where it was.
export class RotationCursor {
  readonly #start: ProjectId | undefined;
  #lastOffered: ProjectId | undefined;
  #lastPlaced: ProjectId | undefined;
  #capacityRanOut = false;

  constructor(start: ProjectId | undefined) {
    this.#start = start;
  }

  offered(projectId: ProjectId): void {
    if (!this.#capacityRanOut) this.#lastOffered = projectId;
  }

  ranOutOfCapacity(): void {
    this.#capacityRanOut = true;
  }

  placed(projectId: ProjectId): void {
    this.#lastPlaced = projectId;
  }

  get next(): ProjectId | undefined {
    return this.#lastPlaced ?? this.#lastOffered ?? this.#start;
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
