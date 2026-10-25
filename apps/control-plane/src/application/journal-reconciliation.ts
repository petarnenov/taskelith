import { createHash } from 'node:crypto';
import {
  canResendAssignment,
  isTerminalExecution,
  recordExecutionEvidence,
  type Execution,
  type JournalId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import type { EnrolledWorker } from '@taskelith/fleet';
import { ok, type EventId, type Result } from '@taskelith/kernel';
import type { Assignment } from '@taskelith/scheduling';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import { notConsumed } from './observation.js';
import type { PendingLog } from './pending-log.js';

// What one transaction attempt of item 21c's reconciliation shares: its
// pending warnings, and the workers whose inventory it already requested.
export interface ReconciliationContext {
  readonly log: PendingLog;
  readonly newRequestId: () => string;
  readonly requested: Set<WorkerId>;
}

// The worker the subject names, and the worker and journal of the body.
export interface Producer {
  readonly subjectWorkerId: string | undefined;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
}

// Why a journal is retired as lost (decision 3).
export type RetirementCause = 'sequence-rollback' | 'snapshot-rollback';

const LOST_HISTORY = 'local-history-lost';

// Decision 2: the subject's worker, enrolled and not revoked, under its
// enrolled journal not retired, or a journal never seen that replaces it.
export async function authenticateProducer(
  tx: ControlPlaneTransaction, producer: Producer, context: ReconciliationContext,
): Promise<Result<void>> {
  const { workerId, journalId } = producer;
  const worker = await tx.fleet.worker(workerId);
  if (!worker.ok) return worker;
  const enrolled = worker.value;
  if (producer.subjectWorkerId !== workerId || enrolled === undefined || enrolled.revokedAt !== undefined) return notAuthenticated(workerId);
  const seen = (await tx.cursors.listByWorker(workerId)).find(({ cursor }) => cursor.journalId === journalId);
  if (journalId === enrolled.journalId) return seen?.retiredAt === undefined ? ok(undefined) : notAuthenticated(workerId);
  if (seen === undefined) return replaceJournal(tx, enrolled, journalId, context);
  context.log.warn({ workerId }, 'execution.journal.refused', { journalId });
  return notAuthenticated(workerId);
}

function notAuthenticated(workerId: WorkerId): Result<never> {
  return notConsumed(`its producer ${workerId} is not authenticated`);
}

// A replacement that lost a race, or a journal another worker holds, is
// refused like any unauthenticated producer.
async function replaceJournal(
  tx: ControlPlaneTransaction, enrolled: EnrolledWorker, journalId: JournalId, context: ReconciliationContext,
): Promise<Result<void>> {
  const { workerId, journalId: previousJournalId } = enrolled;
  const replaced = await tx.fleet.replaceJournal(workerId, previousJournalId, journalId);
  if (!replaced.ok) return replaced.error.code === 'conflict' || replaced.error.code === 'forbidden' ? notAuthenticated(workerId) : replaced;
  const retired = await tx.cursors.retire(workerId, previousJournalId, await tx.now());
  if (!retired.ok) return retired;
  const discarded = await tx.inventoryReports.removeByJournal(workerId, previousJournalId);
  if (!discarded.ok) return discarded;
  context.log.warn({ workerId }, 'execution.journal.replaced', { previousJournalId, journalId });
  for (const assignment of await tx.assignments.listUnfinishedByWorker(workerId)) {
    const reconciled = await reconcileLostHistory(tx, assignment, journalId, context);
    if (!reconciled.ok) return reconciled;
  }
  return ok(undefined);
}

// Decision 3: the worker becomes unreachable and stays fail-closed until a
// new incarnation; ownership and reservations are kept.
export async function retireJournal(
  tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId, cause: RetirementCause, context: ReconciliationContext,
): Promise<Result<void>> {
  const retired = await tx.cursors.retire(workerId, journalId, await tx.now());
  if (!retired.ok) return retired;
  const lost = await tx.reports.recordJournalLoss(workerId);
  if (!lost.ok) return lost;
  const discarded = await tx.inventoryReports.removeByJournal(workerId, journalId);
  if (!discarded.ok) return discarded;
  context.log.warn({ workerId }, 'execution.journal.retired', { journalId, cause });
  return ok(undefined);
}

// Decision 9: the offer again while no grant was ever recorded, else
// every execution under the assignment that can still run is unknown.
export async function reconcileLostHistory(
  tx: ControlPlaneTransaction, assignment: Assignment, cause: string, context: ReconciliationContext,
): Promise<Result<void>> {
  const task = await tx.tasks.get(assignment.reservation.scope.taskId);
  if (!task.ok) return task;
  if (canResendAssignment(task.value, assignment.attemptId)) return resendOffer(tx, assignment, cause, context);
  return recordLostHistory(tx, task.value, assignment);
}

// An omission that proves nothing re-sends the offer while it is safe.
export async function resendIfUngranted(
  tx: ControlPlaneTransaction, assignment: Assignment, cause: string, context: ReconciliationContext,
): Promise<Result<void>> {
  const task = await tx.tasks.get(assignment.reservation.scope.taskId);
  if (!task.ok) return task;
  return canResendAssignment(task.value, assignment.attemptId) ? resendOffer(tx, assignment, cause, context) : ok(undefined);
}

async function recordLostHistory(tx: ControlPlaneTransaction, task: Task, assignment: Assignment): Promise<Result<void>> {
  const at = await tx.now();
  let current = task;
  for (const execution of executionsLosingHistory(task, assignment)) {
    const report = { workerId: execution.workerId, executionId: execution.id, kind: LOST_HISTORY } as const;
    const recorded = recordExecutionEvidence(current, report, at);
    if (!recorded.ok) return recorded;
    const stored = await tx.tasks.replace(recorded.value.task, current.generation);
    if (!stored.ok) return stored;
    current = recorded.value.task;
  }
  return ok(undefined);
}

function executionsLosingHistory(task: Task, assignment: Assignment): readonly Execution[] {
  return task.attempts.flatMap((attempt) => attempt.executions).filter((execution) => execution.assignmentId === assignment.id
    && !isTerminalExecution(execution) && !execution.evidence.some(({ kind }) => kind === LOST_HISTORY));
}

// Decision 12: the stored offer, unchanged, under a fresh identity that a
// serialization retry derives again from the command and its cause.
async function resendOffer(
  tx: ControlPlaneTransaction, assignment: Assignment, cause: string, context: ReconciliationContext,
): Promise<Result<void>> {
  const commandId = assignment.offerCommandId;
  const stored = commandId === undefined ? undefined : await tx.outboxLookup.byEventId(commandId);
  if (commandId === undefined || stored === undefined) {
    const reason = commandId === undefined ? 'no-offer-command' : 'offer-not-stored';
    context.log.warn({ workerId: assignment.workerId, assignmentId: assignment.id }, 'execution.offer.not-resent', { reason });
    return ok(undefined);
  }
  const eventId = `r${createHash('sha256').update(JSON.stringify([commandId, cause])).digest('hex')}` as EventId;
  const appended = await tx.outbox.append({ ...stored, metadata: { ...stored.metadata, eventId } });
  // The same command for the same cause is already on its way.
  return appended.ok || appended.error.code !== 'conflict' ? appended : ok(undefined);
}
