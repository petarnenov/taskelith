import { ok, parseIdentifier, type CorrelationId, type Instant, type Result } from '@taskelith/kernel';
import {
  recordExecutionEvidence,
  revokeLaunch,
  type LaunchPredicate,
  type LaunchRecords,
  type RecordedLaunch,
  type RevocationReason,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import type { CapacityTransaction } from '../ports/capacity-store.js';
import { appendWorkerCommand, cancellationPayload } from './capacity-commands.js';

// A writer's transaction, which also reads the grant index.
export interface InvalidationTransaction extends CapacityTransaction {
  readonly launches: LaunchRecords;
}

// What changed a compared value, in the writer's own transaction (launch
// authorization section 5); a revocation is a request, not proof.
export interface Invalidation {
  readonly predicate: LaunchPredicate;
  readonly reason: RevocationReason;
  readonly correlationId: CorrelationId;
}

type Aftermath = (task: Task, launch: RecordedLaunch, at: Instant) => Result<Task>;

// Revokes the live grants the predicate reads, an empty read included, and
// cancels each attempt once; answers how many attempts it cancelled.
export function invalidateLaunches(tx: InvalidationTransaction, invalidation: Invalidation): Promise<Result<number>> {
  return invalidate(tx, invalidation, (task) => ok(task));
}

// A revoked worker's attempts also become uncertain, which reconciliation
// (item 21) resolves; they are never assumed dead (trust model section 4).
export function invalidateWorkerLaunches(tx: InvalidationTransaction, workerId: WorkerId, correlationId: CorrelationId): Promise<Result<number>> {
  const invalidation: Invalidation = { predicate: { kind: 'worker', workerId }, reason: 'worker-not-authorized', correlationId };
  return invalidate(tx, invalidation, (task, launch, at) => {
    const recorded = recordExecutionEvidence(task, { workerId: launch.workerId, executionId: launch.executionId, kind: 'uncertain' }, at);
    return recorded.ok ? ok(recorded.value.task) : recorded;
  });
}

async function invalidate(tx: InvalidationTransaction, invalidation: Invalidation, aftermath: Aftermath): Promise<Result<number>> {
  const live = await tx.launches.liveGrants(invalidation.predicate);
  if (!live.ok) return live;
  const at = await tx.now();
  const attempts = firstGrantOfEachAttempt(live.value);
  for (const launch of attempts) {
    const cancelled = await revokeAttempt(tx, launch, invalidation, at, aftermath);
    if (!cancelled.ok) return cancelled;
  }
  return ok(attempts.length);
}

async function revokeAttempt(
  tx: InvalidationTransaction,
  launch: RecordedLaunch,
  invalidation: Invalidation,
  at: Instant,
  aftermath: Aftermath,
): Promise<Result<void>> {
  const task = await tx.tasks.get(launch.taskId);
  if (!task.ok) return task;
  const revoked = revokeLaunch(task.value, launch.attemptId, { grants: invalidation.reason, cancellation: 'launch-revoked' }, at);
  if (!revoked.ok) return revoked;
  const stored = await tx.tasks.replace(revoked.value, task.value.generation);
  if (!stored.ok) return stored;
  const settled = aftermath(revoked.value, launch, at);
  if (!settled.ok) return settled;
  // Each change is one generation, so a further one is its own write.
  if (settled.value !== revoked.value) {
    const followed = await tx.tasks.replace(settled.value, revoked.value.generation);
    if (!followed.ok) return followed;
  }
  const assignment = await tx.assignments.get(launch.assignmentId);
  // A grant whose assignment row is gone has no worker command to address.
  if (!assignment.ok) return assignment.error.code === 'not-found' ? ok(undefined) : assignment;
  // Derived from the grant, so a rerun of the writer sends the same command.
  const commandId = parseIdentifier('EventId', `${launch.launchAuthId}.revoked`);
  if (!commandId.ok) return commandId;
  const identity = { commandId: commandId.value, correlationId: invalidation.correlationId };
  return appendWorkerCommand(tx, identity, 'execution.cancellation.request', assignment.value, at, cancellationPayload('launch-revoked'));
}

// The index answers by identity, so the first grant names its attempt.
function firstGrantOfEachAttempt(launches: readonly RecordedLaunch[]): readonly RecordedLaunch[] {
  const seen = new Set<string>();
  return launches.filter((launch) => {
    const key = JSON.stringify([launch.taskId, launch.attemptId]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
