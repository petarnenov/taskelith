import { err, failure, ok, parseIdentifier, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import { fieldFailure } from './field-failure.js';
import { beginWorkflowProgress } from './stage-progress.js';
import type { RunContext } from './task-admission.js';
import type { WorkflowDefinition } from './workflow-definition.js';
import type { WorkflowRunBinding } from './workflow-run-binding.js';

// The kind matches Scheduling's `RunId`, so a reservation scope names a run.
export type WorkflowRunId = Identifier<'RunId'>;

// A workflow run with its binding and progress; a repository compares the
// progress generation, which each stage transition raises.
export interface WorkflowRun extends RunContext {
  readonly id: WorkflowRunId;
}

export interface WorkflowRunInput {
  readonly id: string;
  readonly binding: WorkflowRunBinding;
  readonly definition: WorkflowDefinition;
}

export function beginWorkflowRun(input: WorkflowRunInput, at: Instant): Result<WorkflowRun> {
  const id = parseIdentifier('RunId', input.id);
  if (!id.ok) return fieldFailure('id', id.error);
  const { binding, definition } = input;
  if (binding.workflowId !== definition.id || binding.workflowVersion !== definition.version) {
    return err(failure('invalid', 'the run binding names another workflow than its definition', { run: id.value }));
  }
  return ok(Object.freeze({ id: id.value, binding, progress: beginWorkflowProgress(definition, at) }));
}
