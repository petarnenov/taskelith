import { err, failure, ok, type Result } from '@taskelith/kernel';
import type {
  InventoryPart,
  InventoryReports,
  InventoryRequest,
  InventoryRequests,
  JournalBound,
  JournalId,
  ReportedAssignment,
  ReportedExecution,
  WorkerId,
} from '@taskelith/execution';
import { instant } from './capacity-repositories.js';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

// Execution's inventory tables, beside `producer_cursors` (item 21c).

interface RequestRow {
  readonly request_id: string;
  readonly requested_at: Date;
  readonly bound: string;
}

export class PostgresInventoryRequests implements InventoryRequests {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async current(workerId: WorkerId): Promise<InventoryRequest | undefined> {
    const { rows: [row] } = await this.#session.query<RequestRow>(
      'SELECT request_id, requested_at, bound FROM inventory_requests WHERE worker_id = $1',
      [workerId],
    );
    if (row === undefined) return undefined;
    const bound = decodeRecord<readonly JournalBound[]>(row.bound);
    return Object.freeze({ workerId, requestId: row.request_id, requestedAt: instant(row.requested_at), bound });
  }

  async save(request: InventoryRequest): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO inventory_requests (worker_id, request_id, requested_at, bound) VALUES ($1, $2, $3, $4)
       ON CONFLICT (worker_id) DO UPDATE SET request_id = excluded.request_id, requested_at = excluded.requested_at, bound = excluded.bound`,
      [request.workerId, request.requestId, request.requestedAt, encodeRecord(request.bound)],
    );
    return ok(undefined);
  }
}

interface PartRow {
  readonly report_id: string;
  readonly part: number;
  readonly parts: number;
  readonly worker_id: string;
  readonly journal_id: string;
  readonly request_id: string | null;
  readonly snapshot: string;
  readonly through_sequence: string;
  readonly assignments: string;
  readonly executions: string;
}

export class PostgresInventoryReports implements InventoryReports {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async add(part: InventoryPart): Promise<Result<void>> {
    const inserted = await this.#session.query(
      `INSERT INTO inventory_report_parts (report_id, part, parts, worker_id, journal_id, request_id, snapshot, through_sequence,
         assignments, executions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
      [part.reportId, part.part, part.parts, part.workerId, part.journalId, part.requestId ?? null, part.snapshot, part.throughSequence,
        encodeRecord(part.assignments), encodeRecord(part.executions)],
    );
    if (inserted.rowCount !== 0) return ok(undefined);
    return err(failure('conflict', `part ${part.part} of report ${part.reportId} is stored`, { report: part.reportId }));
  }

  async listByJournal(workerId: WorkerId, journalId: JournalId): Promise<readonly InventoryPart[]> {
    const { rows } = await this.#session.query<PartRow>(
      `SELECT * FROM inventory_report_parts WHERE worker_id = $1 AND journal_id = $2
       ORDER BY snapshot, report_id COLLATE "C", part`,
      [workerId, journalId],
    );
    return rows.map(partOf);
  }

  async remove(reportId: string): Promise<Result<void>> {
    await this.#session.query('DELETE FROM inventory_report_parts WHERE report_id = $1', [reportId]);
    return ok(undefined);
  }

  async removeByJournal(workerId: WorkerId, journalId: JournalId): Promise<Result<void>> {
    await this.#session.query('DELETE FROM inventory_report_parts WHERE worker_id = $1 AND journal_id = $2', [workerId, journalId]);
    return ok(undefined);
  }
}

function partOf(row: PartRow): InventoryPart {
  return Object.freeze({
    reportId: row.report_id,
    part: row.part,
    parts: row.parts,
    workerId: row.worker_id as WorkerId,
    journalId: row.journal_id as JournalId,
    ...(row.request_id === null ? {} : { requestId: row.request_id }),
    snapshot: Number(row.snapshot),
    throughSequence: Number(row.through_sequence),
    assignments: decodeRecord<readonly ReportedAssignment[]>(row.assignments),
    executions: decodeRecord<readonly ReportedExecution[]>(row.executions),
  });
}
