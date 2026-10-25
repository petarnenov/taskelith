import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { activeAttempt, type AttemptId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import type { RunId } from '../domain/capacity-reservation.js';
import { chargedRuns, decideDelegation, type DelegationDecision, type RunCapacity, type TaskLineageLink } from '../domain/delegation-admission.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';

export interface DelegationRequest {
  readonly parentTaskId: TaskId;
  readonly parentAttemptId: AttemptId;
  readonly childTaskId: TaskId;
  readonly childRunId: RunId;
  readonly waitingSince: Instant;
}

// Admits a delegated child in the SERIALIZABLE transaction that creates it;
// the child gets its lineage link, and its parent becomes a waiting parent.
export async function admitDelegation(tx: CapacityTransaction, request: DelegationRequest): Promise<Result<DelegationDecision>> {
  const delegating = await checkDelegatingAttempt(tx, request);
  if (!delegating.ok) return delegating;
  const chain = await lineageChain(tx, request.parentTaskId);
  if (!chain.ok) return chain;
  const [root] = chain.value;
  const parent = chain.value[chain.value.length - 1] ?? root;
  // The parent's held unit counts once it waits, unless it already does.
  const added = (await tx.ledger.isWaitingParent(request.parentAttemptId)) ? 0 : 1;
  const runs = await Promise.all(chargedRuns(request.childRunId, root.runId).map(async (runId): Promise<RunCapacity> => ({
    runId,
    quota: await tx.quotas.runQuota(runId),
    waitingAfter: (await tx.ledger.waitingParentsInRun(runId)) + (chargesRun(parent, root, runId) ? added : 0),
  })));
  const decision = decideDelegation({
    chain: chain.value,
    childRunId: request.childRunId,
    projectQuota: await tx.quotas.projectQuota(root.projectId),
    runs,
    waitingAfter: {
      project: (await tx.ledger.waitingParentsInProject(root.projectId)) + added,
      slots: (await tx.ledger.waitingParentSlots()) + added,
    },
    fleetSlots: await tx.workers.eligibleSlots(),
    waitingSince: request.waitingSince,
    now: await tx.now(),
  });
  if (decision.outcome !== 'admitted') return ok(decision);
  const linked = await tx.lineage.add({ taskId: request.childTaskId, ...decision.link });
  if (!linked.ok) return linked;
  const opened = await tx.ledger.openDelegation({ parentAttemptId: request.parentAttemptId, childTaskId: request.childTaskId, admittedAt: await tx.now() });
  return opened.ok ? ok(decision) : opened;
}

// Contract section 7: the parent is the task of the delegating attempt,
// which must be its active, uncancelled attempt and hold a reservation.
async function checkDelegatingAttempt(tx: CapacityTransaction, request: DelegationRequest): Promise<Result<void>> {
  const parent = await tx.tasks.get(request.parentTaskId);
  if (!parent.ok) return parent;
  const attempt = activeAttempt(parent.value);
  const holds = await tx.ledger.heldForAttempt(request.parentAttemptId);
  if (attempt?.id === request.parentAttemptId && attempt.cancellation === undefined && holds) return ok(undefined);
  return err(failure('precondition-failed', `attempt ${request.parentAttemptId} is not the active, reserved attempt of task ${request.parentTaskId}`, {
    attempt: request.parentAttemptId, task: request.parentTaskId,
  }));
}

type Chain = readonly [TaskLineageLink, ...TaskLineageLink[]];

// The parent's chain from the root, walked up its persisted parent links.
async function lineageChain(tx: CapacityTransaction, taskId: TaskId): Promise<Result<Chain>> {
  const parent = await tx.lineage.get(taskId);
  if (parent === undefined) return missingLink(taskId);
  let chain: Chain = [parent];
  for (let current = parent.parentTaskId; current !== undefined;) {
    const link = await tx.lineage.get(current);
    if (link === undefined) return missingLink(current);
    chain = [link, ...chain];
    current = link.parentTaskId;
  }
  return ok(chain);
}

function missingLink(taskId: TaskId): Result<never> {
  return err(failure('not-found', `task ${taskId} has no lineage link`, { task: taskId }));
}

function chargesRun(parent: TaskLineageLink, root: TaskLineageLink, runId: RunId): boolean {
  return parent.runId === runId || root.runId === runId;
}
