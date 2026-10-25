import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { WorkflowDefinition, WorkflowRunBinding } from '@taskelith/sdlc';

// A workflow definition the control plane accepts runs of, with the digest a
// run's binding must name.
export interface KnownWorkflow {
  readonly definition: WorkflowDefinition;
  readonly digest: string;
}

// Provisional for G2 (coordinator decision Q8): the composition root lists
// the known definitions, since no project resolves one before G3.
export class WorkflowRegistry {
  readonly #known: ReadonlyMap<string, KnownWorkflow>;

  constructor(known: readonly KnownWorkflow[]) {
    this.#known = new Map(known.map((workflow) => [key(workflow.definition.id, workflow.definition.version), workflow]));
  }

  resolve(binding: WorkflowRunBinding): Result<WorkflowDefinition> {
    const known = this.#known.get(key(binding.workflowId, binding.workflowVersion));
    if (known === undefined) {
      return err(failure('precondition-failed', `workflow ${binding.workflowId} ${binding.workflowVersion} is not known`, { workflow: binding.workflowId }));
    }
    if (known.digest !== binding.workflowDigest) {
      return err(failure('precondition-failed', `the binding's digest does not match workflow ${binding.workflowId}`, { workflow: binding.workflowId }));
    }
    return ok(known.definition);
  }
}

function key(id: string, version: string): string {
  return JSON.stringify([id, version]);
}
