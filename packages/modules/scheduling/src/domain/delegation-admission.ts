import type { Instant } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { ProjectId, RunId } from './capacity-reservation.js';
import type { CapacityReason } from './capacity-reasons.js';
import { DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS, MAX_DELEGATION_DEPTH } from './capacity-limits.js';

// A task's place in its delegation tree (contract section 7); a root is its
// own root at depth 0, and a child belongs to its root's project.
export interface TaskLineageLink {
  readonly taskId: TaskId;
  readonly parentTaskId?: TaskId;
  readonly rootTaskId: TaskId;
  readonly depth: number;
  readonly projectId: ProjectId;
  readonly runId: RunId;
}

// What a delegation transaction read: the parent's chain from the root, the
// quotas the child charges, and the units waiting parents hold afterwards.
export interface DelegationSnapshot {
  readonly chain: readonly TaskLineageLink[];
  readonly childRunId: RunId;
  readonly projectQuota: number;
  readonly runQuota: (runId: RunId) => number;
  readonly waitingAfter: WaitingParentUnits;
  readonly fleetSlots: number;
  readonly waitingSince: Instant;
  readonly now: Instant;
}

export interface WaitingParentUnits {
  readonly project: number;
  readonly run: (runId: RunId) => number;
  readonly slots: number;
}

export type DelegationDecision =
  | { readonly outcome: 'admitted'; readonly link: Omit<TaskLineageLink, 'taskId'> }
  | { readonly outcome: 'waiting' | 'rejected'; readonly reason: CapacityReason };

// Depth and runnable chains are checked first and reject at once (D-C); the
// free-unit rule (D-A) makes the delegation wait, up to the bound.
export function decideDelegation(snapshot: DelegationSnapshot): DelegationDecision {
  const parent = snapshot.chain.at(-1)!;
  const root = snapshot.chain[0]!;
  const depth = parent.depth + 1;
  if (depth > MAX_DELEGATION_DEPTH) return rejected('delegation-depth-exceeded');
  const runs = chargedRuns(snapshot.childRunId, root.runId);
  if (!chainFits(snapshot, runs)) return rejected('delegation-chain-exceeds-quota');
  if (!leavesFreeUnits(snapshot, runs)) {
    const waited = Date.parse(snapshot.now) - Date.parse(snapshot.waitingSince);
    const reason = 'delegation-awaiting-capacity';
    return waited >= DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS ? rejected(reason) : Object.freeze({ outcome: 'waiting', reason });
  }
  const link = { parentTaskId: parent.taskId, rootTaskId: root.taskId, depth, projectId: root.projectId, runId: snapshot.childRunId };
  return Object.freeze({ outcome: 'admitted', link: Object.freeze(link) });
}

// A child charges its own run and its root's run, once when they are one.
function chargedRuns(childRunId: RunId, rootRunId: RunId): readonly RunId[] {
  return childRunId === rootRunId ? [childRunId] : [childRunId, rootRunId];
}

// While its ancestors wait, the chain holds one unit per member in each quota
// that member charges, plus the child's own.
function chainFits(snapshot: DelegationSnapshot, runs: readonly RunId[]): boolean {
  const members = [...snapshot.chain.map((link) => link.runId), snapshot.childRunId];
  const rootRunId = snapshot.chain[0]!.runId;
  if (members.length > snapshot.projectQuota) return false;
  return runs.every((runId) => members.filter((memberRun) => memberRun === runId || rootRunId === runId).length <= snapshot.runQuota(runId));
}

function leavesFreeUnits({ waitingAfter, projectQuota, runQuota, fleetSlots }: DelegationSnapshot, runs: readonly RunId[]): boolean {
  return waitingAfter.project < projectQuota
    && runs.every((runId) => waitingAfter.run(runId) < runQuota(runId))
    && waitingAfter.slots < fleetSlots;
}

function rejected(reason: CapacityReason): DelegationDecision {
  return Object.freeze({ outcome: 'rejected', reason });
}
