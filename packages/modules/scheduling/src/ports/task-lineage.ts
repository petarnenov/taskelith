import type { Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { TaskLineageLink } from '../domain/delegation-admission.js';

// The persisted parent links that key every delegation budget; a task's link
// is written once, when the task is created, and `add` fails on a second.
export interface TaskLineage {
  get(taskId: TaskId): Promise<TaskLineageLink | undefined>;
  add(link: TaskLineageLink): Promise<Result<void>>;
}
