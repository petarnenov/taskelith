import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AdmissionId } from '../domain/task-admission.js';
import type { WorkflowRunId } from '../domain/workflow-run.js';
import type { RunCatalog, RunEnvelope } from '../ports/run-catalog.js';

export class InMemoryRunCatalog implements RunCatalog {
  readonly #envelopes = new Map<WorkflowRunId, RunEnvelope>();
  readonly #admissions = new Map<AdmissionId, WorkflowRunId>();

  async register(envelope: RunEnvelope): Promise<Result<void>> {
    if (this.#envelopes.has(envelope.runId)) return err(failure('conflict', `run ${envelope.runId} is registered`, { run: envelope.runId }));
    this.#envelopes.set(envelope.runId, Object.freeze({ ...envelope }));
    return ok(undefined);
  }

  async envelope(runId: WorkflowRunId): Promise<Result<RunEnvelope | undefined>> {
    return ok(this.#envelopes.get(runId));
  }

  async bindAdmission(admissionId: AdmissionId, runId: WorkflowRunId): Promise<Result<void>> {
    if (this.#admissions.has(admissionId)) return err(failure('conflict', `admission ${admissionId} is bound`, { admission: admissionId }));
    this.#admissions.set(admissionId, runId);
    return ok(undefined);
  }

  async runOfAdmission(admissionId: AdmissionId): Promise<Result<WorkflowRunId | undefined>> {
    return ok(this.#admissions.get(admissionId));
  }
}
