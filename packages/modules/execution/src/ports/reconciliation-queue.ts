import type { TaskId } from '@taskelith/sdlc';
import type { WorkerId } from '../domain/identifiers.js';
import type { UnknownExecution, UnrecordedProcess } from '../domain/reconciliation.js';

// What waits for reconciliation (item 21d decision 5); tasks by identity,
// processes by the time they were recorded, then by observation.
export interface ReconciliationQueue {
  unknownExecutionsOfWorker(workerId: WorkerId): Promise<readonly UnknownExecution[]>;
  unknownExecutionsOfTask(taskId: TaskId): Promise<readonly UnknownExecution[]>;
  unrecordedProcessesOfWorker(workerId: WorkerId): Promise<readonly UnrecordedProcess[]>;
}
