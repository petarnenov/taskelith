import type { Result } from '@taskelith/kernel';
import type { Generation, TaskId } from '@taskelith/sdlc';
import type { Task } from '../domain/task.js';

// Stores each task with its attempts, executions, and grants as one record;
// `replace` is a compare-and-set on the task generation.
export interface TaskRepository {
  get(id: TaskId): Promise<Result<Task>>;
  add(task: Task): Promise<Result<void>>;
  replace(task: Task, expectedGeneration: Generation): Promise<Result<void>>;
}
