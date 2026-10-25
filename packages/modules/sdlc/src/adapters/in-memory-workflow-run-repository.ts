import { err, failure, ok, type Result } from '@taskelith/kernel';
import { checkGeneration, type Generation } from '../domain/generation.js';
import type { WorkflowRun, WorkflowRunId } from '../domain/workflow-run.js';
import type { WorkflowRunRepository } from '../ports/workflow-run-repository.js';

// Keeps workflow runs in process memory, for tests and single-process
// composition.
export class InMemoryWorkflowRunRepository implements WorkflowRunRepository {
  readonly #runs = new Map<WorkflowRunId, WorkflowRun>();

  async get(id: WorkflowRunId): Promise<Result<WorkflowRun>> {
    const run = this.#runs.get(id);
    if (run === undefined) return err(failure('not-found', `workflow run ${id} does not exist`, { run: id }));
    return ok(run);
  }

  async add(run: WorkflowRun): Promise<Result<void>> {
    if (this.#runs.has(run.id)) return err(failure('conflict', `workflow run ${run.id} already exists`, { run: run.id }));
    this.#runs.set(run.id, run);
    return ok(undefined);
  }

  async replace(run: WorkflowRun, expectedGeneration: Generation): Promise<Result<void>> {
    const stored = this.#runs.get(run.id);
    if (stored === undefined) return err(failure('not-found', `workflow run ${run.id} does not exist`, { run: run.id }));
    const generation = checkGeneration(`workflow run ${run.id}`, stored.progress.generation, expectedGeneration);
    if (!generation.ok) return generation;
    this.#runs.set(run.id, run);
    return ok(undefined);
  }
}
