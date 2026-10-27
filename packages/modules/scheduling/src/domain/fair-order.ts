import type { Instant } from '@taskelith/kernel';
import type { ProjectId } from './capacity-reservation.js';

export interface WaitingPlacement<Item> {
  readonly projectId: ProjectId;
  readonly waitingSince: Instant;
  readonly item: Item;
}

// Round-robin across projects, oldest waiting first within each, so that one
// project's retry loop cannot take every offer (contract section 5).
export function fairPlacementOrder<Item extends string>(waiting: readonly WaitingPlacement<Item>[]): readonly Item[] {
  const byProject = new Map<ProjectId, WaitingPlacement<Item>[]>();
  for (const entry of [...waiting].sort(byWaitingSince)) {
    byProject.set(entry.projectId, [...(byProject.get(entry.projectId) ?? []), entry]);
  }
  const queues = [...byProject.values()];
  const order: Item[] = [];
  for (let round = 0; order.length < waiting.length; round++) {
    for (const queue of queues) if (queue[round] !== undefined) order.push(queue[round]!.item);
  }
  return order;
}

function byWaitingSince<Item extends string>(left: WaitingPlacement<Item>, right: WaitingPlacement<Item>): number {
  return Date.parse(left.waitingSince) - Date.parse(right.waitingSince)
    || left.projectId.localeCompare(right.projectId) || byCodeUnits(left.item, right.item);
}

// The order of PostgreSQL's "C" collation for ASCII identifiers.
function byCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
