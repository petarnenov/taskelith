import type { PrincipalChange as AccessPrincipalChange, PrincipalChanges } from '@taskelith/access';
import type {
  LogBounds,
  LoggedEntry,
  PrincipalChange,
  StreamFilter,
  UiEvent,
  UiEventLog,
  UiEventOutbox,
} from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { PostgresDatabase } from './postgres-database.js';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

// Delivered at the commit of a transaction that appended an entry, and at
// the commit of a numbering, whose payload is the new head.
export const APPENDED_CHANNEL = 'taskelith_ui_events_appended';
export const NUMBERED_CHANNEL = 'taskelith_ui_events_numbered';

// A visible row's id is below its statement's snapshot xmax unless another
// cluster wrote it, as before a restore; such a transaction has ended.
const FOREIGN_TRANSACTION = 'inserted_by >= pg_snapshot_xmax(pg_current_snapshot())';

// Access and the log each define the change; the stored forms must agree,
// so this fails to compile once the two shapes drift apart.
const PRINCIPAL_CHANGES_AGREE: SameType<Stored<AccessPrincipalChange>, Stored<PrincipalChange>> = true;
void PRINCIPAL_CHANGES_AGREE;

type SameType<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
// A record as its JSON text holds it: a branded identifier is a string.
type Stored<Record> = Record extends object ? { readonly [Key in keyof Record]: Textual<Record[Key]> } : never;
type Textual<Value> = Value extends string ? ({} extends Omit<Value, keyof string> ? Value : string) : Value;

interface EntryRow {
  readonly position: string;
  readonly kind: 'event' | 'principal-change';
  readonly record: string;
}

// One transaction's log rows: writers append SERIALIZABLE; numbering and
// pruning run READ COMMITTED under the sequence row lock, seeing all commits.
export class PostgresUiEventRecords implements UiEventOutbox, PrincipalChanges {
  readonly #session: Session;
  #notified = false;
  numbered = false;

  constructor(session: Session) {
    this.#session = session;
  }

  async append(event: UiEvent): Promise<Result<void>> {
    const projectId = event.scope.kind === 'project' ? event.scope.projectId : null;
    await this.#insert('event', projectId, null, encodeRecord(event));
    return ok(undefined);
  }

  // Access's change, the same record as the log's change (a cross-module
  // write into one table, so that one sequence orders both).
  async record(change: AccessPrincipalChange): Promise<Result<void>> {
    await this.#insert('principal-change', null, change.principalId, encodeRecord(change));
    return ok(undefined);
  }

  // Numbers only entries whose transaction is older than every open one, so
  // no transaction still open can insert an entry before them.
  async assign(limit: number, numberedAt: Instant): Promise<Result<number>> {
    const horizon = await this.#oldestOpenTransaction();
    const head = await this.#lockedHead();
    const { rows } = await this.#session.query<{ numbered: string }>(
      `WITH next AS (
         SELECT entry_id, $1::bigint + row_number() OVER (ORDER BY entry_id) AS position
         FROM ui_events WHERE position IS NULL AND (inserted_by < $4::xid8 OR ${FOREIGN_TRANSACTION})
         ORDER BY entry_id LIMIT $2
       ), numbered AS (
         UPDATE ui_events SET position = next.position, numbered_at = $3 FROM next WHERE ui_events.entry_id = next.entry_id
         RETURNING 1
       )
       SELECT count(*) AS numbered FROM numbered`,
      [head, limit, numberedAt, horizon],
    );
    const count = Number(rows[0]!.numbered);
    if (count === 0) return ok(0);
    this.numbered = true;
    await this.#session.query('UPDATE ui_event_sequence SET head = head + $1', [count]);
    await this.#session.query('SELECT pg_notify($1, $2)', [NUMBERED_CHANNEL, String(head + count)]);
    return ok(count);
  }

  async bounds(): Promise<Result<LogBounds>> {
    const { rows } = await this.#session.query<{ floor: string; head: string }>('SELECT floor, head FROM ui_event_sequence');
    return ok(Object.freeze({ floor: Number(rows[0]!.floor), head: Number(rows[0]!.head) }));
  }

  async readAfter(after: number, through: number, filter: StreamFilter, limit: number): Promise<Result<readonly LoggedEntry[]>> {
    const projectId = filter.scope.kind === 'project' ? filter.scope.projectId : null;
    const { rows } = await this.#session.query<EntryRow>(
      `SELECT position, kind, record FROM ui_events
       WHERE position > $1 AND position <= $2
         AND ((kind = 'event' AND project_id IS NOT DISTINCT FROM $3) OR (kind = 'principal-change' AND principal_id = $4))
       ORDER BY position LIMIT $5`,
      [after, through, projectId, filter.principalId ?? null, limit],
    );
    return ok(Object.freeze(rows.map(entryOf)));
  }

  async prune(before: Instant, limit: number): Promise<Result<number>> {
    await this.#lockedHead();
    const { rows } = await this.#session.query<{ position: string | null }>(
      `WITH doomed AS (
         SELECT entry_id FROM ui_events WHERE position IS NOT NULL AND numbered_at < $1 ORDER BY position LIMIT $2
       ), removed AS (
         DELETE FROM ui_events USING doomed WHERE ui_events.entry_id = doomed.entry_id RETURNING ui_events.position
       )
       SELECT max(position) AS position FROM removed`,
      [before, limit],
    );
    const removed = rows[0]?.position;
    const floor = await this.#session.query<{ floor: string }>(
      'UPDATE ui_event_sequence SET floor = greatest(floor, $1::bigint) RETURNING floor', [removed ?? 0],
    );
    return ok(Number(floor.rows[0]!.floor));
  }

  async #insert(kind: EntryRow['kind'], projectId: string | null, principalId: string | null, record: string): Promise<void> {
    await this.#session.query(
      'INSERT INTO ui_events (kind, project_id, principal_id, record) VALUES ($1, $2, $3, $4)', [kind, projectId, principalId, record],
    );
    if (this.#notified) return;
    this.#notified = true;
    await this.#session.query('SELECT pg_notify($1, $2)', [APPENDED_CHANNEL, '']);
  }

  // Read before the row lock, while this transaction has no id of its own;
  // a horizon older than the lock's grant only delays an entry.
  async #oldestOpenTransaction(): Promise<string> {
    const { rows } = await this.#session.query<{ horizon: string }>('SELECT pg_snapshot_xmin(pg_current_snapshot()) AS horizon');
    return rows[0]!.horizon;
  }

  // Serializes numbering and pruning across processes.
  async #lockedHead(): Promise<number> {
    const { rows } = await this.#session.query<{ head: string }>('SELECT head FROM ui_event_sequence FOR UPDATE');
    return Number(rows[0]!.head);
  }
}

function entryOf(row: EntryRow): LoggedEntry {
  const position = Number(row.position);
  if (row.kind === 'event') return Object.freeze({ kind: 'event', position, event: decodeRecord<UiEvent>(row.record) });
  return Object.freeze({ kind: 'principal-change', position, change: decodeRecord<PrincipalChange>(row.record) });
}

// The log over its own transactions: reads in a read-only snapshot, and
// numbering and pruning READ COMMITTED (see PostgresUiEventRecords).
export class PostgresUiEventLog implements UiEventLog {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  assign(limit: number, numberedAt: Instant): Promise<Result<number>> {
    return this.#database.readCommitted((tx) => tx.uiEvents.assign(limit, numberedAt));
  }

  bounds(): Promise<Result<LogBounds>> {
    return this.#database.readOnly((tx) => tx.uiEvents.bounds());
  }

  readAfter(after: number, through: number, filter: StreamFilter, limit: number): Promise<Result<readonly LoggedEntry[]>> {
    return this.#database.readOnly((tx) => tx.uiEvents.readAfter(after, through, filter, limit));
  }

  prune(before: Instant, limit: number): Promise<Result<number>> {
    return this.#database.readCommitted((tx) => tx.uiEvents.prune(before, limit));
  }
}
