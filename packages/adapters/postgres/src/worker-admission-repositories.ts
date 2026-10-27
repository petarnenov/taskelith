import { err, failure, ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { Sequence, SelfCheckOutcome, SelfCheckResult, WorkerId } from '@taskelith/execution';
import type {
  WorkerAdmissionDecision,
  WorkerAdmissionEntry,
  WorkerAdmissions,
  WorkerAdmissionSnapshot,
  WorkerAdmissionState,
  WorkerAdmissionView,
  WorkerHost,
} from '@taskelith/fleet';
import { databaseNow, instant } from './capacity-repositories.js';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

interface AdmissionRow {
  readonly worker_id: WorkerId;
  readonly host: WorkerHost;
  readonly enrolled_at: string;
  readonly worker_admission: WorkerAdmissionState;
  readonly self_check_reported_at: Date | null;
}

interface ResultRow {
  readonly worker_id: WorkerId;
  readonly check_id: string;
  readonly outcome: SelfCheckOutcome;
  readonly details: string[];
}

// Worker admission contract sections 5 to 8, on the `workers` row that
// placement reads and the table of the last report's results.
export class PostgresWorkerAdmissions implements WorkerAdmissions, WorkerAdmissionView {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async record(workerId: WorkerId, decision: WorkerAdmissionDecision, sequence: Sequence, at: Instant): Promise<Result<void>> {
    const updated = await this.#session.query(
      `UPDATE workers SET worker_admission = $2, self_check_sequence = $3, self_check_reported_at = $4
       WHERE worker_id = $1 AND self_check_sequence < $3`,
      [workerId, decision.state, sequence, at],
    );
    if (updated.rowCount === 0) return this.#exists(workerId);
    return this.#replaceResults(workerId, decision.results);
  }

  async awaitSelfCheck(workerId: WorkerId): Promise<Result<void>> {
    const updated = await this.#session.query(
      `UPDATE workers SET worker_admission = 'awaiting-self-check', self_check_sequence = 0, self_check_reported_at = NULL
       WHERE worker_id = $1`,
      [workerId],
    );
    if (updated.rowCount === 0) return this.#exists(workerId);
    return this.#replaceResults(workerId, []);
  }

  async workers(): Promise<Result<WorkerAdmissionSnapshot>> {
    const asOf = await databaseNow(this.#session);
    const { rows } = await this.#session.query<AdmissionRow>(
      `SELECT worker_id, enrollment::jsonb -> 'host' AS host, enrollment::jsonb ->> 'enrolledAt' AS enrolled_at,
         worker_admission, self_check_reported_at
       FROM workers WHERE enrollment IS NOT NULL AND NOT revoked ORDER BY worker_id COLLATE "C"`,
    );
    const results = await this.#session.query<ResultRow>(
      `SELECT worker_id, check_id, outcome, details FROM worker_self_check_results
       ORDER BY worker_id COLLATE "C", check_id COLLATE "C"`,
    );
    const workers: WorkerAdmissionEntry[] = [];
    for (const row of rows) {
      const entry = entryOf(row, results.rows.filter((result) => result.worker_id === row.worker_id));
      if (!entry.ok) return entry;
      workers.push(entry.value);
    }
    return ok(Object.freeze({ asOf, workers: Object.freeze(workers) }));
  }

  async #replaceResults(workerId: WorkerId, results: readonly SelfCheckResult[]): Promise<Result<void>> {
    await this.#session.query('DELETE FROM worker_self_check_results WHERE worker_id = $1', [workerId]);
    for (const { checkId, outcome, details } of results) {
      await this.#session.query(
        'INSERT INTO worker_self_check_results (worker_id, check_id, outcome, details) VALUES ($1, $2, $3, $4)',
        [workerId, checkId, outcome, [...details]],
      );
    }
    return ok(undefined);
  }

  // An update its fence skips still succeeds; only a missing worker fails.
  async #exists(workerId: WorkerId): Promise<Result<void>> {
    const { rowCount } = await this.#session.query('SELECT 1 FROM workers WHERE worker_id = $1 AND enrollment IS NOT NULL', [workerId]);
    return rowCount === 0 ? err(failure('not-found', `worker ${workerId} has no record`, { worker: workerId })) : ok(undefined);
  }
}

function entryOf(row: AdmissionRow, results: readonly ResultRow[]): Result<WorkerAdmissionEntry> {
  const enrolledAt = parseInstant(row.enrolled_at);
  if (!enrolledAt.ok) return enrolledAt;
  return ok(Object.freeze({
    workerId: row.worker_id,
    host: Object.freeze({ ...row.host }),
    enrolledAt: enrolledAt.value,
    admission: row.worker_admission,
    ...(row.self_check_reported_at === null ? {} : { reportedAt: instant(row.self_check_reported_at) }),
    results: Object.freeze(results.map(({ check_id: checkId, outcome, details }) => Object.freeze({
      checkId, outcome, details: Object.freeze([...details]),
    }))),
  }));
}

// Each call runs as its own SERIALIZABLE transaction.
export class CommittingWorkerAdmissions implements WorkerAdmissions, WorkerAdmissionView {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  record(workerId: WorkerId, decision: WorkerAdmissionDecision, sequence: Sequence, at: Instant): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.workerAdmissions.record(workerId, decision, sequence, at));
  }

  awaitSelfCheck(workerId: WorkerId): Promise<Result<void>> {
    return this.#database.transaction((tx) => tx.workerAdmissions.awaitSelfCheck(workerId));
  }

  workers(): Promise<Result<WorkerAdmissionSnapshot>> {
    return this.#database.transaction((tx) => tx.workerAdmissions.workers());
  }
}
