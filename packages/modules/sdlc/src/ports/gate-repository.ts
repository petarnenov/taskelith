import type { Result } from '@taskelith/kernel';
import type { Gate, GateId } from '../domain/gate.js';
import type { Generation } from '../domain/generation.js';
import type { WorkflowRunId } from '../domain/workflow-run.js';

// Stores the gates of each run; a gate belongs to the run it was added to,
// and `replace` is a compare-and-set on the gate's generation.
export interface GateRepository {
  get(id: GateId): Promise<Result<Gate>>;
  add(runId: WorkflowRunId, gate: Gate): Promise<Result<void>>;
  replace(gate: Gate, expectedGeneration: Generation): Promise<Result<void>>;
  listByRun(runId: WorkflowRunId): Promise<readonly Gate[]>;
}
