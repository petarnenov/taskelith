import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { activeAttempt, type AttemptId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import type { RunId } from '../domain/capacity-reservation.js';
import { chargedRuns, decideDelegation, type DelegationDecision, type TaskLineageLink } from '../domain/delegation-admission.js';
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
  const root = chain.value[0]!;
  const parentHolds = await tx.ledger.heldForAttempt(request.parentAttemptId);
  const runs = chargedRuns(request.childRunId, root.runId);
  const waitingRuns = new Map(await Promise.all(runs.map(async (runId) => [runId, await tx.ledger.waitingParentsInRun(runId)] as const)));
  const quotas = new Map(await Promise.all(runs.map(async (runId) => [runId, await tx.quotas.runQuota(runId)] as const)));
  // The parent's held unit counts once it waits, unless it already does.
  const added = parentHolds && !(await tx.ledger.isWaitingParent(request.parentAttemptId)) ? 1 : 0;
  const decision = decideDelegation({
    chain: chain.value,
    childRunId: request.childRunId,
    projectQuota: await tx.quotas.projectQuota(root.projectId),
    runQuota: (runId) => quotas.get(runId)!,
    waitingAfter: {
      project: (await tx.ledger.waitingParentsInProject(root.projectId)) + added,
      run: (runId) => waitingRuns.get(runId)! + (chargesRun(chain.value.at(-1)!, root, runId) ? added : 0),
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
// which must be that task's active, uncancelled attempt.
async function checkDelegatingAttempt(tx: CapacityTransaction, request: DelegationRequest): Promise<Result<void>> {
  const parent = await tx.tasks.get(request.parentTaskId);
  if (!parent.ok) return parent;
  const attempt = activeAttempt(parent.value);
  if (attempt?.id === request.parentAttemptId && attempt.cancellation === undefined) return ok(undefined);
  return err(failure('precondition-failed', `attempt ${request.parentAttemptId} is not the active attempt of task ${request.parentTaskId}`, {
    attempt: request.parentAttemptId, task: request.parentTaskId,
  }));
}

async function lineageChain(tx: CapacityTransaction, taskId: TaskId): Promise<Result<readonly TaskLineageLink[]>> {
  const chain: TaskLineageLink[] = [];
  for (let current: TaskId | undefined = taskId; current !== undefined;) {
    const link = await tx.lineage.get(current);
    if (link === undefined) return err(failure('not-found', `task ${current} has no lineage link`, { task: current }));
    chain.unshift(link);
    current = link.parentTaskId;
  }
  return ok(chain);
}

function chargesRun(parent: TaskLineageLink, root: TaskLineageLink, runId: RunId): boolean {
  return parent.runId === runId || root.runId === runId;
}
