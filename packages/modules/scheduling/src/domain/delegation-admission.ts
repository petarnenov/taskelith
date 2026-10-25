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
// runs the child charges with their quotas, and waiting parents' units.
export interface DelegationSnapshot {
  readonly chain: readonly [TaskLineageLink, ...TaskLineageLink[]];
  readonly childRunId: RunId;
  readonly projectQuota: number;
  readonly runs: readonly RunCapacity[];
  readonly waitingAfter: WaitingParentUnits;
  readonly fleetSlots: number;
  readonly waitingSince: Instant;
  readonly now: Instant;
}

// One run the child charges (`chargedRuns`), with the units that waiting
// parents would hold in it once the delegation is admitted.
export interface RunCapacity {
  readonly runId: RunId;
  readonly quota: number;
  readonly waitingAfter: number;
}

export interface WaitingParentUnits {
  readonly project: number;
  readonly slots: number;
}

export type DelegationDecision =
  | { readonly outcome: 'admitted'; readonly link: Omit<TaskLineageLink, 'taskId'> }
  | { readonly outcome: 'waiting' | 'rejected'; readonly reason: CapacityReason };

// Depth and runnable chains are checked first and reject at once (D-C); the
// free-unit rule (D-A) makes the delegation wait, up to the bound.
export function decideDelegation(snapshot: DelegationSnapshot): DelegationDecision {
  const root = snapshot.chain[0];
  const parent = snapshot.chain[snapshot.chain.length - 1] ?? root;
  const depth = parent.depth + 1;
  if (depth > MAX_DELEGATION_DEPTH) return rejected('delegation-depth-exceeded');
  if (!chainFits(snapshot)) return rejected('delegation-chain-exceeds-quota');
  if (!leavesFreeUnits(snapshot)) {
    const waited = Date.parse(snapshot.now) - Date.parse(snapshot.waitingSince);
    const reason = 'delegation-awaiting-capacity';
    return waited >= DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS ? rejected(reason) : Object.freeze({ outcome: 'waiting', reason });
  }
  const link = { parentTaskId: parent.taskId, rootTaskId: root.taskId, depth, projectId: root.projectId, runId: snapshot.childRunId };
  return Object.freeze({ outcome: 'admitted', link: Object.freeze(link) });
}

// A reservation charges its own run and its root's run, once when they are
// one (contract section 7).
export function chargedRuns(childRunId: RunId, rootRunId: RunId): readonly RunId[] {
  return childRunId === rootRunId ? [childRunId] : [childRunId, rootRunId];
}

// While its ancestors wait, the chain holds one unit per member in each quota
// that member charges, plus the child's own.
function chainFits({ chain, childRunId, projectQuota, runs }: DelegationSnapshot): boolean {
  const members = [...chain.map((link) => link.runId), childRunId];
  const rootRunId = chain[0].runId;
  if (members.length > projectQuota) return false;
  return runs.every((run) => members.filter((memberRun) => memberRun === run.runId || rootRunId === run.runId).length <= run.quota);
}

function leavesFreeUnits({ waitingAfter, projectQuota, runs, fleetSlots }: DelegationSnapshot): boolean {
  return waitingAfter.project < projectQuota && runs.every((run) => run.waitingAfter < run.quota) && waitingAfter.slots < fleetSlots;
}

function rejected(reason: CapacityReason): DelegationDecision {
  return Object.freeze({ outcome: 'rejected', reason });
}
