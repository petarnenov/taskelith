import { err, failure, ok, type Result } from '@taskelith/kernel';
import { checkGeneration, checkNextGeneration, type Generation, type TaskId } from '@taskelith/sdlc';
import type { Task } from '../domain/task.js';
import type { TaskRepository } from '../ports/task-repository.js';

// Keeps tasks in process memory; it checks and writes without awaiting, so
// concurrent replaces cannot both pass the generation check.
export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks = new Map<TaskId, Task>();

  async get(id: TaskId): Promise<Result<Task>> {
    const task = this.#tasks.get(id);
    if (task === undefined) return err(failure('not-found', `task ${id} does not exist`, { task: id }));
    return ok(task);
  }

  async add(task: Task): Promise<Result<void>> {
    if (this.#tasks.has(task.id)) return err(failure('conflict', `task ${task.id} already exists`, { task: task.id }));
    this.#tasks.set(task.id, task);
    return ok(undefined);
  }

  async replace(task: Task, expectedGeneration: Generation): Promise<Result<void>> {
    const stored = this.#tasks.get(task.id);
    if (stored === undefined) return err(failure('not-found', `task ${task.id} does not exist`, { task: task.id }));
    const generation = checkGeneration(`task ${task.id}`, stored.generation, expectedGeneration);
    if (!generation.ok) return generation;
    const next = checkNextGeneration(`task ${task.id}`, task.generation, expectedGeneration);
    if (!next.ok) return next;
    this.#tasks.set(task.id, task);
    return ok(undefined);
  }
}
