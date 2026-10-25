import type { Identifier, Instant, Result } from '@taskelith/kernel';
import type { AdmissionId } from '../domain/task-admission.js';
import type { WorkflowRunId } from '../domain/workflow-run.js';

// The kind matches Scheduling's `ProjectId`.
export type ProjectId = Identifier<'ProjectId'>;

// What the API tells about a run beyond its binding and progress.
export interface RunEnvelope {
  readonly runId: WorkflowRunId;
  readonly projectId: ProjectId;
  readonly createdAt: Instant;
}

// Each run's project and creation time, and each admission's run; writing an
// entry again is `conflict`, and a run is stored before its envelope.
export interface RunCatalog {
  register(envelope: RunEnvelope): Promise<Result<void>>;
  envelope(runId: WorkflowRunId): Promise<Result<RunEnvelope | undefined>>;
  bindAdmission(admissionId: AdmissionId, runId: WorkflowRunId): Promise<Result<void>>;
  runOfAdmission(admissionId: AdmissionId): Promise<Result<WorkflowRunId | undefined>>;
}
