import type { Instant } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import { isUnknownExecution, type Execution } from './execution.js';
import type { AttemptId, WorkerId } from './identifiers.js';
import type { JournalId, ObservationId } from './observation-sequence.js';
import type { Task } from './task.js';

// A process of the worker that no journal record names (21c decision 13):
// never current work, and kept for an operator's reconciliation.
export interface UnrecordedProcess {
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly observationId: ObservationId;
  readonly containment: string;
  readonly processCount: number;
  readonly recordedAt: Instant;
}

// An execution whose running is not known, and where its task holds it.
export interface UnknownExecution {
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly execution: Execution;
}

// In the order of the task's attempts and of their executions.
export function unknownExecutionsOf(task: Task): readonly UnknownExecution[] {
  return task.attempts.flatMap((attempt) => attempt.executions.filter(isUnknownExecution)
    .map((execution) => Object.freeze({ taskId: task.id, attemptId: attempt.id, execution })));
}
