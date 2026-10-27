import { ok, type Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { WorkerId } from '../domain/identifiers.js';
import { unknownExecutionsOf, type UnknownExecution, type UnrecordedProcess } from '../domain/reconciliation.js';
import type { Task } from '../domain/task.js';
import type { ReconciliationQueue } from '../ports/reconciliation-queue.js';
import type { UnrecordedProcesses } from '../ports/unrecorded-processes.js';

// Keeps the recorded unrecorded processes in process memory.
export class InMemoryUnrecordedProcesses implements UnrecordedProcesses {
  readonly #processes = new Map<string, UnrecordedProcess>();

  async record(process: UnrecordedProcess): Promise<Result<void>> {
    const key = JSON.stringify([process.workerId, process.observationId]);
    if (!this.#processes.has(key)) this.#processes.set(key, structuredClone(process));
    return ok(undefined);
  }

  ofWorker(workerId: WorkerId): readonly UnrecordedProcess[] {
    return [...this.#processes.values()].filter((process) => process.workerId === workerId)
      .sort((left, right) => compare([left.recordedAt, left.observationId], [right.recordedAt, right.observationId]));
  }
}

// Reads the queue from the stored tasks and the recorded processes.
export class InMemoryReconciliationQueue implements ReconciliationQueue {
  readonly #tasks: () => readonly Task[];
  readonly #processes: InMemoryUnrecordedProcesses;

  constructor(tasks: () => readonly Task[], processes: InMemoryUnrecordedProcesses) {
    this.#tasks = tasks;
    this.#processes = processes;
  }

  async unknownExecutionsOfWorker(workerId: WorkerId): Promise<readonly UnknownExecution[]> {
    return this.#unknown().filter(({ execution }) => execution.workerId === workerId);
  }

  async unknownExecutionsOfTask(taskId: TaskId): Promise<readonly UnknownExecution[]> {
    return this.#unknown().filter((unknown) => unknown.taskId === taskId);
  }

  async unrecordedProcessesOfWorker(workerId: WorkerId): Promise<readonly UnrecordedProcess[]> {
    return this.#processes.ofWorker(workerId);
  }

  #unknown(): readonly UnknownExecution[] {
    return [...this.#tasks()].sort((left, right) => compare([left.id], [right.id])).flatMap(unknownExecutionsOf);
  }
}

// Code unit order, as PostgreSQL's "C" collation sorts.
function compare(left: readonly string[], right: readonly string[]): number {
  const index = left.findIndex((part, at) => part !== right[at]);
  if (index === -1) return 0;
  return left[index]! < right[index]! ? -1 : 1;
}
