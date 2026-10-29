import type {
  HeldKey,
  IdempotencyRecord,
  IdempotencyRecords,
  NeedsYouItemId,
  OutputEntry,
  RequestKey,
  ScopedInboxItem,
  Session as TimelineSession,
  SessionAuditEvent,
  SessionAuditRecords,
  SessionId,
  SessionInboxItem,
  SessionInboxItems,
  SessionItemKind,
  SessionRecords,
  SessionScope,
  SessionScopes,
  SessionTimelineStore,
  SessionTimelineTransaction,
  StoredSession,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import type { PostgresDatabase } from './postgres-database.js';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

// The session timeline tables of one transaction; `changed` tells the
// transaction runner to reach the SessionTimelineCommit crash points.
export class PostgresSessionTimelineTransaction implements SessionTimelineTransaction {
  readonly sessions: PostgresSessionRecords;
  readonly idempotency: PostgresIdempotencyRecords;
  readonly items: PostgresSessionInboxItems;
  readonly audit: PostgresSessionAuditRecords;
  readonly scopes: PostgresSessionScopeReads;

  constructor(session: Session) {
    this.sessions = new PostgresSessionRecords(session);
    this.idempotency = new PostgresIdempotencyRecords(session);
    this.items = new PostgresSessionInboxItems(session);
    this.audit = new PostgresSessionAuditRecords(session);
    this.scopes = new PostgresSessionScopeReads(session);
  }

  get changed(): boolean {
    return this.sessions.changed || this.idempotency.changed || this.items.changed || this.audit.changed;
  }
}

// Each transaction is SERIALIZABLE, with the database's retries of the
// whole work, so a lost race reruns and answers as a repeat.
export class PostgresSessionTimelineStore implements SessionTimelineStore {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  transaction<Value>(work: (tx: SessionTimelineTransaction) => Promise<Result<Value>>): Promise<Result<Value>> {
    return this.#database.transaction((tx) => work(tx.sessionTimeline));
  }
}

// The scopes through Scheduling's task lineage, each read in a snapshot.
export class PostgresSessionScopes implements SessionScopes {
  readonly #database: PostgresDatabase;

  constructor(database: PostgresDatabase) {
    this.#database = database;
  }

  scopeOf(sessionId: SessionId): Promise<Result<SessionScope | undefined>> {
    return this.#database.readOnly((tx) => tx.sessionTimeline.scopes.scopeOf(sessionId));
  }

  isCard(projectId: ProjectId, runId: WorkflowRunId): Promise<Result<boolean>> {
    return this.#database.readOnly((tx) => tx.sessionTimeline.scopes.isCard(projectId, runId));
  }

  listByCard(scope: SessionScope, after: SessionId | undefined, limit: number): Promise<Result<readonly SessionId[]>> {
    return this.#database.readOnly((tx) => tx.sessionTimeline.scopes.listByCard(scope, after, limit));
  }
}

// A session's project is its task's, and its card the run of its task's
// lineage root (product ports, section 3.3).
const SCOPED_SESSIONS = `agent_sessions
  JOIN task_lineage AS lineage ON lineage.task_id = agent_sessions.task_id
  JOIN task_lineage AS root ON root.task_id = lineage.root_task_id`;

interface ScopeRow {
  readonly project_id: string;
  readonly run_id: string;
}

// The scopes read within one session timeline transaction.
export class PostgresSessionScopeReads implements SessionScopes {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async scopeOf(sessionId: SessionId): Promise<Result<SessionScope | undefined>> {
    const { rows } = await this.#session.query<ScopeRow>(
      `SELECT lineage.project_id, root.run_id FROM ${SCOPED_SESSIONS} WHERE agent_sessions.session_id = $1`, [sessionId],
    );
    return ok(rows[0] === undefined ? undefined : scopeOfRow(rows[0]));
  }

  // A root run of the project that holds no delegated child task.
  async isCard(projectId: ProjectId, runId: WorkflowRunId): Promise<Result<boolean>> {
    const { rows } = await this.#session.query<{ card: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM workflow_runs WHERE id = $1 AND project_id = $2)
         AND NOT EXISTS (SELECT 1 FROM task_lineage WHERE run_id = $1 AND depth > 0) AS card`,
      [runId, projectId],
    );
    return ok(rows[0]?.card === true);
  }

  async listByCard(scope: SessionScope, after: SessionId | undefined, limit: number): Promise<Result<readonly SessionId[]>> {
    const { rows } = await this.#session.query<{ session_id: string }>(
      `SELECT agent_sessions.session_id FROM ${SCOPED_SESSIONS}
       WHERE lineage.project_id = $1 AND root.run_id = $2 AND ($3::text IS NULL OR agent_sessions.session_id COLLATE "C" > $3)
       ORDER BY agent_sessions.session_id COLLATE "C" LIMIT $4`,
      [scope.projectId, scope.runId, after ?? null, limit],
    );
    return ok(Object.freeze(rows.map((row) => row.session_id as SessionId)));
  }
}

type ItemRow = { readonly record: string; readonly project_id: string | null; readonly run_id: string | null };

// Items are written only when their state changes: an insert at opening
// and one update at resolution or closure, never an upsert.
class PostgresSessionInboxItems implements SessionInboxItems {
  readonly #session: Session;
  changed = false;

  constructor(session: Session) {
    this.#session = session;
  }

  async find(sessionId: SessionId, kind: SessionItemKind, request: RequestKey): Promise<Result<SessionInboxItem | undefined>> {
    const { rows } = await this.#session.query<{ record: string }>(
      'SELECT record FROM session_inbox_items WHERE session_id = $1 AND generation = $2 AND native_request_id = $3 AND kind = $4',
      [sessionId, request.generation, request.nativeRequestId, kind],
    );
    return ok(rows[0] === undefined ? undefined : decodeRecord<SessionInboxItem>(rows[0].record));
  }

  async get(id: NeedsYouItemId): Promise<Result<ScopedInboxItem | undefined>> {
    const { rows } = await this.#session.query<ItemRow>(
      `SELECT items.record, lineage.project_id, root.run_id FROM session_inbox_items AS items
       JOIN agent_sessions ON agent_sessions.session_id = items.session_id
       LEFT JOIN task_lineage AS lineage ON lineage.task_id = agent_sessions.task_id
       LEFT JOIN task_lineage AS root ON root.task_id = lineage.root_task_id
       WHERE items.item_id = $1`,
      [id],
    );
    return ok(rows[0] === undefined ? undefined : scopedItemOf(rows[0]));
  }

  async add(item: SessionInboxItem): Promise<Result<void>> {
    this.changed = true;
    const { rowCount } = await this.#session.query(
      `INSERT INTO session_inbox_items (item_id, session_id, kind, generation, native_request_id, state, record)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [item.id, item.sessionId, item.kind, item.request.generation, item.request.nativeRequestId, item.state, encodeRecord(item)],
    );
    if (rowCount === 0) return err(failure('conflict', `the item ${item.id} or its request's item exists`, { session: item.sessionId }));
    return ok(undefined);
  }

  async settle(item: SessionInboxItem): Promise<Result<void>> {
    this.changed = true;
    const { rowCount } = await this.#session.query(
      "UPDATE session_inbox_items SET state = $2, record = $3 WHERE item_id = $1 AND state = 'open'",
      [item.id, item.state, encodeRecord(item)],
    );
    if (rowCount === 0) return err(failure('conflict', `the item ${item.id} is not open`, { session: item.sessionId }));
    return ok(undefined);
  }

  async listOpen(projectId: ProjectId, after: NeedsYouItemId | undefined, limit: number): Promise<Result<readonly ScopedInboxItem[]>> {
    const { rows } = await this.#session.query<ItemRow>(
      `SELECT items.record, lineage.project_id, root.run_id FROM session_inbox_items AS items
       JOIN ${SCOPED_SESSIONS} ON agent_sessions.session_id = items.session_id
       WHERE items.state = 'open' AND lineage.project_id = $1 AND ($2::text IS NULL OR items.item_id COLLATE "C" > $2)
       ORDER BY items.item_id COLLATE "C" LIMIT $3`,
      [projectId, after ?? null, limit],
    );
    return ok(Object.freeze(rows.map(scopedItemOf)));
  }
}

class PostgresSessionAuditRecords implements SessionAuditRecords {
  readonly #session: Session;
  changed = false;

  constructor(session: Session) {
    this.#session = session;
  }

  async append(event: SessionAuditEvent): Promise<Result<void>> {
    this.changed = true;
    await this.#session.query(
      'INSERT INTO session_audit_events (kind, item_id, actor, occurred_at) VALUES ($1, $2, $3, $4)',
      [event.kind, event.subject, event.actor, event.occurredAt],
    );
    return ok(undefined);
  }
}

function scopeOfRow(row: ScopeRow): SessionScope {
  return Object.freeze({ projectId: row.project_id as ProjectId, runId: row.run_id as WorkflowRunId });
}

// Without a lineage, the left joins leave the scope's columns null.
function scopedItemOf(row: ItemRow): ScopedInboxItem {
  const item = decodeRecord<SessionInboxItem>(row.record);
  if (row.project_id === null || row.run_id === null) return Object.freeze({ item });
  return Object.freeze({ item, scope: scopeOfRow({ project_id: row.project_id, run_id: row.run_id }) });
}

type SessionRecord = Omit<TimelineSession, 'output'> & {
  readonly output: Omit<TimelineSession['output'], 'entries'>;
};

class PostgresSessionRecords implements SessionRecords {
  readonly #session: Session;
  changed = false;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(id: SessionId): Promise<Result<StoredSession | undefined>> {
    const { rows } = await this.#session.query<{ record: string; version: string }>(
      'SELECT record, version FROM agent_sessions WHERE session_id = $1', [id],
    );
    const row = rows[0];
    if (row === undefined) return ok(undefined);
    const session = await this.#assembled(decodeRecord<SessionRecord>(row.record));
    return ok(Object.freeze({ session, version: Number(row.version) }));
  }

  async add(timeline: TimelineSession): Promise<Result<void>> {
    this.changed = true;
    const { rowCount } = await this.#session.query(
      'INSERT INTO agent_sessions (session_id, task_id, version, record) VALUES ($1, $2, 1, $3) ON CONFLICT DO NOTHING',
      [timeline.id, timeline.taskId, encodeRecord(recordOf(timeline))],
    );
    if (rowCount === 0) return err(failure('conflict', `the session ${timeline.id} exists`, { session: timeline.id }));
    const bound = await this.#bindAttempts(timeline, timeline.attempts);
    if (!bound.ok) return bound;
    await this.#insertOutput(timeline.id, timeline.output.entries);
    return ok(undefined);
  }

  async replace(stored: StoredSession, next: TimelineSession): Promise<Result<void>> {
    this.changed = true;
    const { rowCount } = next.id !== stored.session.id ? { rowCount: 0 } : await this.#session.query(
      'UPDATE agent_sessions SET version = version + 1, record = $3 WHERE session_id = $1 AND version = $2',
      [stored.session.id, stored.version, encodeRecord(recordOf(next))],
    );
    if (rowCount === 0) {
      return err(failure('conflict', `the session ${stored.session.id} changed since version ${stored.version}`, { session: stored.session.id }));
    }
    const known = new Set(stored.session.attempts.map((attempt) => attempt.id));
    const bound = await this.#bindAttempts(next, next.attempts.filter((attempt) => !known.has(attempt.id)));
    if (!bound.ok) return bound;
    const appended = next.output.entries.filter((entry) => entry.position > stored.session.output.lastPosition);
    await this.#insertOutput(next.id, appended);
    await this.#trimOutput(next);
    return ok(undefined);
  }

  async listByTask(taskId: TaskId): Promise<Result<readonly TimelineSession[]>> {
    const { rows } = await this.#session.query<{ record: string }>(
      'SELECT record FROM agent_sessions WHERE task_id = $1 ORDER BY session_id COLLATE "C"', [taskId],
    );
    const sessions = await Promise.all(rows.map((row) => this.#assembled(decodeRecord<SessionRecord>(row.record))));
    return ok(Object.freeze(sessions));
  }

  // Writes only new bindings; the key keeps an attempt in one session even
  // when two transactions bind it at once (design decision 3).
  async #bindAttempts(timeline: TimelineSession, attempts: TimelineSession['attempts']): Promise<Result<void>> {
    for (const attempt of attempts) {
      const { rows } = await this.#session.query<{ session_id: string }>(
        `INSERT INTO agent_session_attempts (attempt_id, session_id, task_id) VALUES ($1, $2, $3)
         ON CONFLICT (attempt_id) DO UPDATE SET attempt_id = EXCLUDED.attempt_id RETURNING session_id`,
        [attempt.id, timeline.id, timeline.taskId],
      );
      if (rows[0]?.session_id !== timeline.id) {
        return err(failure('conflict', `another session binds the attempt ${attempt.id}`, { session: timeline.id }));
      }
    }
    return ok(undefined);
  }

  async #insertOutput(sessionId: SessionId, entries: readonly OutputEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.#session.query(
        'INSERT INTO agent_session_output (session_id, position, record) VALUES ($1, $2, $3)',
        [sessionId, entry.position, encodeRecord(entry)],
      );
    }
  }

  async #trimOutput(timeline: TimelineSession): Promise<void> {
    const earliest = timeline.output.entries[0]?.position ?? timeline.output.lastPosition + 1;
    await this.#session.query('DELETE FROM agent_session_output WHERE session_id = $1 AND position < $2', [timeline.id, earliest]);
  }

  async #assembled(record: SessionRecord): Promise<TimelineSession> {
    const { rows } = await this.#session.query<{ record: string }>(
      'SELECT record FROM agent_session_output WHERE session_id = $1 ORDER BY position', [record.id],
    );
    const entries = Object.freeze(rows.map((row) => decodeRecord<OutputEntry>(row.record)));
    return Object.freeze({ ...record, output: Object.freeze({ ...record.output, entries }) });
  }
}

class PostgresIdempotencyRecords implements IdempotencyRecords {
  readonly #session: Session;
  changed = false;

  constructor(session: Session) {
    this.#session = session;
  }

  async find(sessionId: SessionId, scope: string, key: HeldKey): Promise<Result<IdempotencyRecord | undefined>> {
    const { rows } = await this.#session.query<{ digest: string; outcome: string | null }>(
      'SELECT digest, outcome FROM session_idempotency_keys WHERE session_id = $1 AND scope = $2 AND key = $3',
      [sessionId, scope, key],
    );
    const row = rows[0];
    if (row === undefined) return ok(undefined);
    const outcome = row.outcome === null ? {} : { outcome: row.outcome };
    return ok(Object.freeze({ scope, key, digest: row.digest, ...outcome }));
  }

  async record(sessionId: SessionId, record: IdempotencyRecord): Promise<Result<void>> {
    this.changed = true;
    const { rowCount } = await this.#session.query(
      `INSERT INTO session_idempotency_keys (session_id, scope, key, digest, outcome) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [sessionId, record.scope, record.key, record.digest, record.outcome ?? null],
    );
    if (rowCount === 0) return err(failure('conflict', `the session ${sessionId} holds the key ${record.key}`, { session: sessionId }));
    return ok(undefined);
  }
}

function recordOf(timeline: TimelineSession): SessionRecord {
  const { entries: _entries, ...output } = timeline.output;
  return { ...timeline, output };
}
