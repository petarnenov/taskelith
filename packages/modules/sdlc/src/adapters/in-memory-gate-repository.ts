import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { Gate, GateId } from '../domain/gate.js';
import { checkGeneration, checkNextGeneration, type Generation } from '../domain/generation.js';
import type { WorkflowRunId } from '../domain/workflow-run.js';
import type { GateRepository } from '../ports/gate-repository.js';

interface StoredGate {
  readonly runId: WorkflowRunId;
  readonly gate: Gate;
}

// Keeps gates in process memory, each with the run it belongs to.
export class InMemoryGateRepository implements GateRepository {
  readonly #gates = new Map<GateId, StoredGate>();

  async get(id: GateId): Promise<Result<Gate>> {
    const stored = this.#gates.get(id);
    if (stored === undefined) return err(failure('not-found', `gate ${id} does not exist`, { gate: id }));
    return ok(stored.gate);
  }

  async add(runId: WorkflowRunId, gate: Gate): Promise<Result<void>> {
    if (this.#gates.has(gate.id)) return err(failure('conflict', `gate ${gate.id} already exists`, { gate: gate.id }));
    this.#gates.set(gate.id, { runId, gate });
    return ok(undefined);
  }

  async replace(gate: Gate, expectedGeneration: Generation): Promise<Result<void>> {
    const stored = this.#gates.get(gate.id);
    if (stored === undefined) return err(failure('not-found', `gate ${gate.id} does not exist`, { gate: gate.id }));
    const generation = checkGeneration(`gate ${gate.id}`, stored.gate.generation, expectedGeneration);
    if (!generation.ok) return generation;
    const next = checkNextGeneration(`gate ${gate.id}`, gate.generation, expectedGeneration);
    if (!next.ok) return next;
    this.#gates.set(gate.id, { runId: stored.runId, gate });
    return ok(undefined);
  }

  async listByRun(runId: WorkflowRunId): Promise<readonly Gate[]> {
    return [...this.#gates.values()].filter((stored) => stored.runId === runId).map((stored) => stored.gate);
  }
}
