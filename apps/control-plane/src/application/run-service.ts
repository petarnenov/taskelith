import type { HttpSchemas } from '@taskelith/contracts';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { beginWorkflowRun, parseWorkflowRunBinding, type ProjectId, type WorkflowRunBinding } from '@taskelith/sdlc';
import type { ControlPlaneStore } from './control-plane-store.js';
import type { WorkflowRegistry } from './workflow-registry.js';

export type CreateRunRequest = HttpSchemas['CreateRunRequest'];
export type RunView = HttpSchemas['Run'];

// `createRun`: the client chooses the run identifier, so a retry with the same
// request returns the stored run, and another request for it is `conflict`.
export class RunService {
  readonly #store: ControlPlaneStore;
  readonly #registry: WorkflowRegistry;

  constructor(store: ControlPlaneStore, registry: WorkflowRegistry) {
    this.#store = store;
    this.#registry = registry;
  }

  async createRun(request: CreateRunRequest): Promise<Result<RunView>> {
    const binding = parseWorkflowRunBinding(request.binding);
    if (!binding.ok) return binding;
    const projectId = parseIdentifier('ProjectId', request.projectId);
    if (!projectId.ok) return projectId;
    const definition = this.#registry.resolve(binding.value);
    if (!definition.ok) return definition;
    return this.#store.transaction(async (tx) => {
      const at = await tx.now();
      const run = beginWorkflowRun({ id: request.runId, binding: binding.value, definition: definition.value }, at);
      if (!run.ok) return run;
      const existing = await tx.catalog.envelope(run.value.id);
      if (!existing.ok) return existing;
      if (existing.value !== undefined) {
        const stored = await tx.runs.get(run.value.id);
        if (!stored.ok) return stored;
        const same = existing.value.projectId === projectId.value && sameBinding(stored.value.binding, binding.value);
        if (!same) return err(failure('conflict', `run ${run.value.id} exists with another binding`, { run: run.value.id }));
        return ok(view(run.value.id, existing.value.projectId, stored.value.binding, existing.value.createdAt));
      }
      const added = await tx.runs.add(run.value);
      if (!added.ok) return added;
      const registered = await tx.catalog.register({ runId: run.value.id, projectId: projectId.value as ProjectId, createdAt: at });
      return registered.ok ? ok(view(run.value.id, projectId.value, binding.value, at)) : registered;
    });
  }
}

function sameBinding(left: WorkflowRunBinding, right: WorkflowRunBinding): boolean {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

function view(runId: string, projectId: string, binding: WorkflowRunBinding, createdAt: string): RunView {
  return { runId, projectId, binding: { ...binding }, createdAt };
}
