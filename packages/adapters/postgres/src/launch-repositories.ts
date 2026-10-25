import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  isTerminalExecution,
  type LaunchAuthId,
  type LaunchPredicate,
  type LaunchRecords,
  type OperationId,
  type RecordedLaunch,
  type RecordedRejection,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { parseArtifactRevision, type ArtifactId, type ArtifactRevision, type CurrentRevisions, type WorkflowRunId } from '@taskelith/sdlc';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

const RECORDED_LAUNCH = 'launch_auth_id, task_id, attempt_id, assignment_id, execution_id, worker_id';

interface LaunchRow {
  readonly launch_auth_id: string;
  readonly task_id: string;
  readonly attempt_id: string;
  readonly assignment_id: string;
  readonly execution_id: string;
  readonly worker_id: string;
}

// Writes the index rows of a task's grants after the task's record; a row's
// identity and values never change, only whether it is live.
export async function indexLaunchGrants(session: Session, task: Task): Promise<boolean> {
  let recorded = false;
  for (const attempt of task.attempts) {
    for (const execution of attempt.executions) {
      const runnable = !isTerminalExecution(execution);
      for (const grant of execution.grants) {
        const { rows } = await session.query<{ inserted: boolean }>(
          `INSERT INTO launch_authorizations (launch_auth_id, worker_id, operation_id, task_id, attempt_id, assignment_id,
             execution_id, run_id, relied_on_gates, artifact_ids, live)
           VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT run_id FROM assignments WHERE id = $6), $8, $9, $10)
           ON CONFLICT (launch_auth_id) DO UPDATE SET live = EXCLUDED.live
           RETURNING xmax = 0 AS inserted`,
          [grant.launchAuthId, grant.workerId, grant.operationId, task.id, grant.attemptId, grant.assignmentId, grant.executionId,
            [...grant.reliedOnGates], grant.artifacts.map((artifact) => artifact.artifactId),
            runnable && grant.state === 'granted'],
        );
        recorded ||= rows[0]?.inserted === true;
      }
    }
  }
  return recorded;
}

export class PostgresLaunchRecords implements LaunchRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async byOperation(workerId: WorkerId, operationId: OperationId): Promise<Result<RecordedLaunch | undefined>> {
    const rows = await this.#launches('worker_id = $1 AND operation_id = $2', [workerId, operationId]);
    return ok(rows[0]);
  }

  async byLaunchAuthId(launchAuthId: LaunchAuthId): Promise<Result<RecordedLaunch | undefined>> {
    const rows = await this.#launches('launch_auth_id = $1', [launchAuthId]);
    return ok(rows[0]);
  }

  async liveGrants(predicate: LaunchPredicate): Promise<Result<readonly RecordedLaunch[]>> {
    const [condition, values] = predicateCondition(predicate);
    return ok(await this.#launches(`live AND ${condition}`, values));
  }

  async rejection(workerId: WorkerId, operationId: OperationId): Promise<Result<RecordedRejection | undefined>> {
    const { rows } = await this.#session.query<{ request: string; rejection: string }>(
      'SELECT request, rejection FROM launch_rejections WHERE worker_id = $1 AND operation_id = $2',
      [workerId, operationId],
    );
    const row = rows[0];
    if (row === undefined) return ok(undefined);
    return ok(Object.freeze({ request: decodeRecord<RecordedRejection['request']>(row.request), rejection: decodeRecord<RecordedRejection['rejection']>(row.rejection) }));
  }

  async recordRejection(recorded: RecordedRejection): Promise<Result<void>> {
    const { workerId, operationId } = recorded.request;
    const inserted = await this.#session.query(
      `INSERT INTO launch_rejections (worker_id, operation_id, request, rejection) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [workerId, operationId, encodeRecord(recorded.request), encodeRecord(recorded.rejection)],
    );
    if (inserted.rowCount !== 0) return ok(undefined);
    return err(failure('conflict', `operation ${operationId} has a recorded rejection`, { operation: operationId }));
  }

  async #launches(condition: string, values: readonly unknown[]): Promise<RecordedLaunch[]> {
    const { rows } = await this.#session.query<LaunchRow>(
      `SELECT ${RECORDED_LAUNCH} FROM launch_authorizations WHERE ${condition} ORDER BY launch_auth_id`,
      values,
    );
    return rows.map((row) => Object.freeze({
      launchAuthId: row.launch_auth_id as LaunchAuthId,
      taskId: row.task_id as RecordedLaunch['taskId'],
      attemptId: row.attempt_id as RecordedLaunch['attemptId'],
      assignmentId: row.assignment_id as RecordedLaunch['assignmentId'],
      executionId: row.execution_id as RecordedLaunch['executionId'],
      workerId: row.worker_id as WorkerId,
    }));
  }
}

function predicateCondition(predicate: LaunchPredicate): [string, unknown[]] {
  switch (predicate.kind) {
    case 'worker':
      return ['worker_id = $1', [predicate.workerId]];
    case 'assignment':
      return ['assignment_id = $1', [predicate.assignmentId]];
    case 'run':
      return ['run_id = $1', [predicate.runId]];
    case 'artifact':
      return ['artifact_ids @> ARRAY[$1::text]', [predicate.artifactId]];
    case 'gates':
      return ['relied_on_gates && $1::text[]', [[...predicate.gateIds]]];
    case 'all':
      return ['true', []];
  }
}

// A revision is stored whole, so reading it back needs no other table.
export class PostgresCurrentRevisions implements CurrentRevisions {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async seed(runId: WorkflowRunId, revisions: readonly ArtifactRevision[]): Promise<Result<void>> {
    for (const revision of revisions) {
      await this.#session.query(
        'INSERT INTO current_revisions (run_id, artifact_id, revision) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [runId, revision.artifactId, encodeRecord(revision)],
      );
    }
    return ok(undefined);
  }

  async current(runId: WorkflowRunId, artifactIds: readonly ArtifactId[]): Promise<Result<readonly ArtifactRevision[]>> {
    const { rows } = await this.#session.query<{ revision: string }>(
      'SELECT revision FROM current_revisions WHERE run_id = $1 AND artifact_id = ANY($2) ORDER BY artifact_id',
      [runId, [...artifactIds]],
    );
    const revisions: ArtifactRevision[] = [];
    for (const row of rows) {
      const parsed = parseArtifactRevision(decodeRecord(row.revision));
      if (!parsed.ok) return parsed;
      revisions.push(parsed.value);
    }
    return ok(revisions);
  }
}
