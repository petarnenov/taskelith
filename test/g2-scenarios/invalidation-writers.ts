import { randomUUID } from 'node:crypto';
import type { AssignmentId } from '@taskelith/execution';
import type { CorrelationId, EventId } from '@taskelith/kernel';
import { cancelInTransaction, supersedeUngrantedInTransaction, type Assignment } from '@taskelith/scheduling';
import { value } from '@taskelith/testing';
import type { ScenarioInstallation } from './scenario-installation.ts';

// Test-side invalidation writers: the product has no operator cancel API,
// so a scenario commits the capacity operations in its own transaction.

export interface AssignmentRow {
  readonly assignmentId: AssignmentId;
  readonly workerId: string;
  readonly attemptId: string;
}

// The assignments of a task's attempts, oldest first.
export async function assignmentsOf(installation: ScenarioInstallation, taskId: string): Promise<AssignmentRow[]> {
  const task = await installation.task(taskId);
  const rows = await installation.query<{ id: string; worker_id: string; attempt_id: string }>(
    'SELECT id, worker_id, attempt_id FROM assignments WHERE attempt_id = ANY($1) ORDER BY generation', [task.attempts.map(({ id }) => id)],
  );
  return rows.map((row) => ({ assignmentId: row.id as AssignmentId, workerId: row.worker_id, attemptId: row.attempt_id }));
}

// Cancels an assignment as contract section 6 D-B does: without a runnable
// execution it ends; otherwise its launch is revoked and cancelled.
export async function cancelAssignment(installation: ScenarioInstallation, assignmentId: AssignmentId): Promise<Assignment> {
  return value(await installation.store.transaction((tx) => cancelInTransaction(tx, { assignmentId, ...commandIdentity() })));
}

// Supersedes an assignment without a grant, whatever its bounds.
export async function supersedeAssignment(installation: ScenarioInstallation, assignmentId: AssignmentId): Promise<Assignment> {
  return value(await installation.store.transaction((tx) => supersedeUngrantedInTransaction(tx, { assignmentId, ...commandIdentity() })));
}

function commandIdentity(): { commandId: EventId; correlationId: CorrelationId } {
  return { commandId: `e-${randomUUID()}` as EventId, correlationId: `c-${randomUUID()}` as CorrelationId };
}
