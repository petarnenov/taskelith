import type { Result } from '@taskelith/kernel';
import type { Generation } from '../domain/generation.js';
import type { WorkflowRun, WorkflowRunId } from '../domain/workflow-run.js';

// Stores workflow runs; `replace` fails with `conflict` unless the stored
// progress is at the expected generation.
export interface WorkflowRunRepository {
  get(id: WorkflowRunId): Promise<Result<WorkflowRun>>;
  add(run: WorkflowRun): Promise<Result<void>>;
  replace(run: WorkflowRun, expectedGeneration: Generation): Promise<Result<void>>;
}
