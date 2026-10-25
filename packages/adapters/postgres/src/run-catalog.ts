import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { AdmissionId, ProjectId, RunCatalog, RunEnvelope, WorkflowRunId } from '@taskelith/sdlc';
import { instant } from './capacity-repositories.js';
import type { Session } from './session.js';

// The envelope is two columns of the run's row, and an admission's run one
// column of the admission's row; each is written once.
export class PostgresRunCatalog implements RunCatalog {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async register(envelope: RunEnvelope): Promise<Result<void>> {
    const updated = await this.#session.query(
      'UPDATE workflow_runs SET project_id = $2, created_at = $3 WHERE id = $1 AND project_id IS NULL',
      [envelope.runId, envelope.projectId, envelope.createdAt],
    );
    if (updated.rowCount !== 0) return ok(undefined);
    return err(failure('conflict', `run ${envelope.runId} is registered or not stored`, { run: envelope.runId }));
  }

  async envelope(runId: WorkflowRunId): Promise<Result<RunEnvelope | undefined>> {
    const { rows } = await this.#session.query<{ project_id: string; created_at: Date }>(
      'SELECT project_id, created_at FROM workflow_runs WHERE id = $1 AND project_id IS NOT NULL',
      [runId],
    );
    const row = rows[0];
    if (row === undefined) return ok(undefined);
    return ok(Object.freeze({ runId, projectId: row.project_id as ProjectId, createdAt: instant(row.created_at) }));
  }

  async bindAdmission(admissionId: AdmissionId, runId: WorkflowRunId): Promise<Result<void>> {
    const updated = await this.#session.query('UPDATE admissions SET run_id = $2 WHERE id = $1 AND run_id IS NULL', [admissionId, runId]);
    if (updated.rowCount !== 0) return ok(undefined);
    return err(failure('conflict', `admission ${admissionId} is bound or not stored`, { admission: admissionId }));
  }

  async runOfAdmission(admissionId: AdmissionId): Promise<Result<WorkflowRunId | undefined>> {
    const { rows } = await this.#session.query<{ run_id: string | null }>('SELECT run_id FROM admissions WHERE id = $1', [admissionId]);
    const runId = rows[0]?.run_id;
    return ok(runId === null || runId === undefined ? undefined : (runId as WorkflowRunId));
  }
}
