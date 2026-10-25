import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import {
  startProducerCursor,
  type JournalId,
  type ProducerCursor,
  type ProducerCursors,
  type ProducerJournal,
  type Sequence,
  type WorkerId,
} from '@taskelith/execution';
import type { CapacityDeclaration, WorkerReports } from '@taskelith/scheduling';
import { instant } from './capacity-repositories.js';
import type { Session } from './session.js';

// What the observation transaction writes: Execution's producer cursors and
// Scheduling's worker record, each behind its module's port (item 21b).

interface CursorRow {
  readonly confirmed_through: string;
  readonly applied_above: string[];
}

interface JournalRow extends CursorRow {
  readonly journal_id: string;
  readonly retired_at: Date | null;
  readonly reported_snapshot: string;
}

export class PostgresProducerCursors implements ProducerCursors {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(workerId: WorkerId, journalId: JournalId): Promise<ProducerCursor> {
    const { rows } = await this.#session.query<CursorRow>(
      'SELECT confirmed_through, applied_above FROM producer_cursors WHERE worker_id = $1 AND journal_id = $2',
      [workerId, journalId],
    );
    const row = rows[0];
    return row === undefined ? startProducerCursor(workerId, journalId) : cursorOf(workerId, journalId, row);
  }

  async save(cursor: ProducerCursor): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO producer_cursors (worker_id, journal_id, confirmed_through, applied_above) VALUES ($1, $2, $3, $4)
       ON CONFLICT (worker_id, journal_id) DO UPDATE SET confirmed_through = excluded.confirmed_through, applied_above = excluded.applied_above`,
      [cursor.workerId, cursor.journalId, cursor.confirmedThrough, [...cursor.appliedAbove]],
    );
    return ok(undefined);
  }

  async listByWorker(workerId: WorkerId): Promise<readonly ProducerJournal[]> {
    const { rows } = await this.#session.query<JournalRow>(
      `SELECT journal_id, confirmed_through, applied_above, retired_at, reported_snapshot FROM producer_cursors
       WHERE worker_id = $1 ORDER BY journal_id COLLATE "C"`,
      [workerId],
    );
    return rows.map((row) => Object.freeze({
      cursor: cursorOf(workerId, row.journal_id as JournalId, row),
      ...(row.retired_at === null ? {} : { retiredAt: instant(row.retired_at) }),
      reportedSnapshot: Number(row.reported_snapshot),
    }));
  }

  async retire(workerId: WorkerId, journalId: JournalId, at: Instant): Promise<Result<void>> {
    return this.#upsert(workerId, journalId, 'retired_at', at, 'coalesce(producer_cursors.retired_at, excluded.retired_at)');
  }

  async recordReportedSnapshot(workerId: WorkerId, journalId: JournalId, snapshot: number): Promise<Result<void>> {
    return this.#upsert(workerId, journalId, 'reported_snapshot', snapshot, 'greatest(producer_cursors.reported_snapshot, excluded.reported_snapshot)');
  }

  // A journal without a row is stored with an empty cursor first.
  async #upsert(workerId: WorkerId, journalId: JournalId, column: string, value: unknown, kept: string): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO producer_cursors (worker_id, journal_id, confirmed_through, applied_above, ${column}) VALUES ($1, $2, 0, '{}', $3)
       ON CONFLICT (worker_id, journal_id) DO UPDATE SET ${column} = ${kept}`,
      [workerId, journalId, value],
    );
    return ok(undefined);
  }
}

function cursorOf(workerId: WorkerId, journalId: JournalId, row: CursorRow): ProducerCursor {
  const appliedAbove = Object.freeze(row.applied_above.map((sequence) => Number(sequence) as Sequence));
  return Object.freeze({ workerId, journalId, confirmedThrough: Number(row.confirmed_through), appliedAbove });
}

// Each write runs at the transaction's SERIALIZABLE isolation, as every
// writer of `workers` does (capacity reservation section 13).
export class PostgresWorkerReports implements WorkerReports {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  recordContact(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    return this.#update(workerId, 'reachable = true, last_contact_at = greatest(last_contact_at, $2::timestamptz)', [at]);
  }

  recordJournalLoss(workerId: WorkerId): Promise<Result<void>> {
    return this.#update(workerId, 'reachable = false', []);
  }

  restartFences(workerId: WorkerId): Promise<Result<void>> {
    return this.#update(workerId, 'capacity_sequence = 0, pressure_sequence = 0, capacity_refusal_sequence = 0, protocol_sequence = 0', []);
  }

  declareCapacity(workerId: WorkerId, declaration: CapacityDeclaration, sequence: Sequence): Promise<Result<void>> {
    const { slots, cpuMillicores, memoryMebibytes, controls } = declaration;
    return this.#update(workerId, `capacity_sequence = $2, slots = $3, cpu_millicores = $4, memory_mebibytes = $5, controls = $6`,
      [sequence, slots, cpuMillicores, memoryMebibytes, [...controls]], 'capacity_sequence < $2');
  }

  enterPressure(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>> {
    return this.#update(workerId, 'pressure_sequence = $2, admission_pressure_since = coalesce(admission_pressure_since, $3)',
      [sequence, at], 'pressure_sequence < $2');
  }

  leavePressure(workerId: WorkerId, sequence: Sequence): Promise<Result<void>> {
    return this.#update(workerId, 'pressure_sequence = $2, admission_pressure_since = NULL', [sequence], 'pressure_sequence < $2');
  }

  markCapacityRefused(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>> {
    return this.#update(workerId, 'capacity_refusal_sequence = $2, capacity_refused_since = coalesce(capacity_refused_since, $3)',
      [sequence, at], 'capacity_refusal_sequence < $2');
  }

  clearCapacityRefusal(workerId: WorkerId, sequence: Sequence): Promise<Result<void>> {
    return this.#update(workerId, 'capacity_refusal_sequence = $2, capacity_refused_since = NULL', [sequence], 'capacity_refusal_sequence < $2');
  }

  setProtocolVersion(workerId: WorkerId, protocolVersion: number | undefined, sequence: Sequence): Promise<Result<void>> {
    return this.#update(workerId, 'protocol_sequence = $2, protocol_version = $3', [sequence, protocolVersion ?? null], 'protocol_sequence < $2');
  }

  // An update its condition skips still succeeds; only a missing worker fails.
  async #update(workerId: WorkerId, changes: string, values: readonly unknown[], condition = 'true'): Promise<Result<void>> {
    const updated = await this.#session.query(`UPDATE workers SET ${changes} WHERE worker_id = $1 AND ${condition}`, [workerId, ...values]);
    if (updated.rowCount !== 0) return ok(undefined);
    const { rowCount } = await this.#session.query('SELECT 1 FROM workers WHERE worker_id = $1', [workerId]);
    return rowCount === 0 ? err(failure('not-found', `worker ${workerId} has no record`, { worker: workerId })) : ok(undefined);
  }
}
