import {
  ATTEMPT_NOT_CURRENT,
  ITEM_CLOSED,
  isUnknownExecution,
  publishItem,
  resolveByOperator,
  type AssignmentId,
  type CardSubject,
  type NeedsYouItem,
  type ReconciliationAnswers,
  type UiEventOutbox,
} from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { reconcileByOperator } from '@taskelith/scheduling';
import type { EvidenceReference } from '@taskelith/sdlc';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import type { OpenReconciliation, ReconciliationResolution, ReconciliationResolver } from './reconciliation-source.js';
import { followAttemptEnd } from './task-ending.js';

export const SUBJECT_CHANGED = 'subject-changed';

// The answer's SERIALIZABLE transaction, the resolved items' store and the
// event log included.
export interface ReconciliationTransaction extends ControlPlaneTransaction {
  readonly reconciliationAnswers: Pick<ReconciliationAnswers, 'record'>;
  readonly uiEvents: UiEventOutbox;
}

// Resolves an item in the answer's transaction: the stored item, its event,
// and for an unknown execution the operator's end of its attempt.
export class TransactionalReconciliationResolver implements ReconciliationResolver {
  readonly #tx: ReconciliationTransaction;

  constructor(tx: ReconciliationTransaction) {
    this.#tx = tx;
  }

  async resolve(item: OpenReconciliation, resolution: ReconciliationResolution): Promise<Result<NeedsYouItem>> {
    const at = await this.#tx.now();
    if (item.subject.scope === 'card' && resolution.answer.kind === 'reconciliation') {
      const ended = await this.#endExecution(item.subject, resolution.answer.evidence, at);
      if (!ended.ok) return ended;
    }
    const { state: _state, ...fields } = item;
    const resolved = Object.freeze({ ...fields, state: 'resolved' as const, resolution: Object.freeze({ ...resolution, resolvedAt: at }) });
    const recorded = await this.#tx.reconciliationAnswers.record(resolved);
    if (!recorded.ok) return recorded;
    const published = await publishItem(this.#tx.uiEvents, resolved, at);
    return published.ok ? ok(resolved) : published;
  }

  // G2 `resolveByOperator`, which revokes the execution's grants, and the
  // release of its reservation, while the execution is still unknown.
  async #endExecution(subject: CardSubject, evidence: EvidenceReference, at: Instant): Promise<Result<void>> {
    const { taskId, attemptId, attemptGeneration, executionId } = subject;
    if (taskId === undefined || attemptId === undefined || executionId === undefined) {
      return err(failure('internal', 'an unknown execution item names no task, attempt, or execution'));
    }
    const task = await this.#tx.tasks.get(taskId);
    if (!task.ok) return task;
    const execution = task.value.attempts.find((attempt) => attempt.id === attemptId)?.executions.find((each) => each.id === executionId);
    if (execution === undefined || !isUnknownExecution(execution)) return refusal(ITEM_CLOSED, `execution ${executionId} is no longer unknown`);
    if (task.value.ownershipGeneration !== attemptGeneration) return refusal(ATTEMPT_NOT_CURRENT, `task ${taskId} has a newer generation`);
    const resolved = resolveByOperator(task.value, attemptId, evidence, at);
    if (!resolved.ok) return refusal(SUBJECT_CHANGED, resolved.error.message);
    const stored = await this.#tx.tasks.replace(resolved.value, task.value.generation);
    if (!stored.ok) return stored;
    const released = await this.#release(execution.assignmentId, at);
    return released.ok ? followAttemptEnd(this.#tx, resolved.value, attemptId, at) : released;
  }

  async #release(assignmentId: AssignmentId, at: Instant): Promise<Result<void>> {
    const assignment = await this.#tx.assignments.get(assignmentId);
    if (!assignment.ok) return assignment;
    if (assignment.value.reservation.state === 'released') return ok(undefined);
    const reconciled = reconcileByOperator(assignment.value, assignment.value.generation, at);
    return reconciled.ok ? this.#tx.assignments.replace(reconciled.value, assignment.value.generation) : reconciled;
  }
}

function refusal(reason: string, message: string): Result<never> {
  return err(failure('precondition-failed', message, { reason }));
}
