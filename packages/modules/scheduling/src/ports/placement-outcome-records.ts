import type { Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { PlacementOutcomeRecord } from '../domain/placement-outcome-record.js';

// One record per task (capacity reservation section 13, "Recorded outcome");
// a record replaces the task's earlier one.
export interface PlacementOutcomeRecords {
  record(outcome: PlacementOutcomeRecord): Promise<Result<void>>;
  // Removing a task without a record succeeds.
  remove(taskId: TaskId): Promise<Result<void>>;
  get(taskId: TaskId): Promise<PlacementOutcomeRecord | undefined>;
  // The records of those of the tasks that have one, in task id order.
  list(taskIds: readonly TaskId[]): Promise<readonly PlacementOutcomeRecord[]>;
}
