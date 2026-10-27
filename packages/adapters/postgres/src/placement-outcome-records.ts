import type { AttemptId } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import type { PlacementOutcomeRecord, PlacementOutcomeRecords } from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';
import { instant } from './capacity-repositories.js';
import type { Session } from './session.js';

interface OutcomeRow {
  readonly task_id: string;
  readonly attempt_id: string | null;
  readonly disposition: string;
  readonly reason: string;
  readonly source: string;
  readonly recorded_at: Date;
}

const COLUMNS = 'task_id, attempt_id, disposition, reason, source, recorded_at';

// One row per task; a record is an upsert, so it replaces the earlier one.
export class PostgresPlacementOutcomeRecords implements PlacementOutcomeRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async record(outcome: PlacementOutcomeRecord): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO placement_outcomes (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (task_id) DO UPDATE SET attempt_id = EXCLUDED.attempt_id, disposition = EXCLUDED.disposition,
         reason = EXCLUDED.reason, source = EXCLUDED.source, recorded_at = EXCLUDED.recorded_at`,
      [outcome.taskId, outcome.attemptId ?? null, outcome.disposition, outcome.reason, outcome.source, outcome.recordedAt],
    );
    return ok(undefined);
  }

  async remove(taskId: TaskId): Promise<Result<void>> {
    await this.#session.query('DELETE FROM placement_outcomes WHERE task_id = $1', [taskId]);
    return ok(undefined);
  }

  async get(taskId: TaskId): Promise<PlacementOutcomeRecord | undefined> {
    const { rows } = await this.#session.query<OutcomeRow>(`SELECT ${COLUMNS} FROM placement_outcomes WHERE task_id = $1`, [taskId]);
    return rows[0] && outcomeOf(rows[0]);
  }

  async list(taskIds: readonly TaskId[]): Promise<readonly PlacementOutcomeRecord[]> {
    const { rows } = await this.#session.query<OutcomeRow>(
      `SELECT ${COLUMNS} FROM placement_outcomes WHERE task_id = ANY($1::text[]) ORDER BY task_id COLLATE "C"`,
      [taskIds],
    );
    return Object.freeze(rows.map(outcomeOf));
  }
}

// The table's checks keep the disposition and source within their values.
function outcomeOf(row: OutcomeRow): PlacementOutcomeRecord {
  return Object.freeze({
    taskId: row.task_id as TaskId,
    ...(row.attempt_id === null ? {} : { attemptId: row.attempt_id as AttemptId }),
    disposition: row.disposition,
    reason: row.reason,
    source: row.source,
    recordedAt: instant(row.recorded_at),
  } as PlacementOutcomeRecord);
}
