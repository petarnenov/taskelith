import assert from 'node:assert/strict';
import type { JournaledExecution, JournalSnapshot, LaunchGrant, Task } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import { value } from '@taskelith/testing';
import { REDELIVERY_BUDGET_MILLISECONDS, type ScenarioInstallation } from './scenario-installation.ts';
import type { ScenarioWorker } from './scenario-worker.ts';
import { waitFor } from './waiting.ts';

export interface ExecutedTask {
  readonly result: Record<string, unknown>;
  readonly executions: number;
  readonly startKind: string;
}

// The task ended exited 0, with one started execution in its only attempt.
// A start redelivered after the exit is applied as a historical start.
export async function assertExitedOnce(installation: ScenarioInstallation, taskId: string): Promise<ExecutedTask> {
  const result = await installation.ended(taskId);
  await waitFor(async () => (await startedExecutions(installation, taskId)) > 0, REDELIVERY_BUDGET_MILLISECONDS + 5_000, 'the start fact');
  const task = await installation.task(taskId);
  assert.equal(task.attempts.length, 1, 'one attempt');
  const [attempt] = task.attempts;
  assert.deepEqual(attempt!.outcome?.kind === 'exited' && attempt!.outcome.status, { kind: 'code', code: 0 });
  const started = attempt!.executions.filter((execution) => execution.start !== undefined);
  assert.equal(started.length, 1, `one started execution: ${JSON.stringify(task)}`);
  return { result, executions: attempt!.executions.length, startKind: started[0]!.start!.kind };
}

export async function startedExecutions(installation: ScenarioInstallation, taskId: string): Promise<number> {
  const read = await installation.store.transaction((tx) => tx.tasks.get(taskId as TaskId));
  if (!read.ok) return 0;
  return read.value.attempts.flatMap((attempt) => attempt.executions).filter((execution) => execution.start !== undefined).length;
}

// The state the worker journaled for its latest execution.
export function journaledState(worker: ScenarioWorker): string | undefined {
  const snapshot = worker.running.root.journal.snapshot();
  return snapshot.ok ? snapshot.value.executions.at(-1)?.state : undefined;
}

export function journalOf(worker: ScenarioWorker): JournalSnapshot {
  return value(worker.running.root.journal.snapshot());
}

// The executions the worker journaled under one assignment.
export function journaledUnder(worker: ScenarioWorker, assignmentId: string): readonly JournaledExecution[] {
  return journalOf(worker).executions.filter((execution) => execution.assignmentId === assignmentId);
}

export function intentEnded(worker: ScenarioWorker, assignmentId: string): boolean {
  return journalOf(worker).intents.some((intent) => intent.assignmentId === assignmentId && intent.ended);
}

// Every grant the control plane recorded under one assignment.
export function grantsUnder(task: Task, assignmentId: string): readonly LaunchGrant[] {
  return task.attempts.flatMap((attempt) => attempt.executions)
    .filter((execution) => execution.assignmentId === assignmentId).flatMap((execution) => execution.grants);
}

export async function reachable(installation: ScenarioInstallation, workerId: string): Promise<boolean> {
  const [row] = await installation.query<{ reachable: boolean }>('SELECT reachable FROM workers WHERE worker_id = $1', [workerId]);
  return row?.reachable === true;
}
