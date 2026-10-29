import type {
  HeldKey,
  IdempotencyRecord,
  IdempotencyRecords,
  OutputEntry,
  Session as TimelineSession,
  SessionId,
  SessionRecords,
  SessionTimelineStore,
  SessionTimelineTransaction,
  StoredSession,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { PostgresDatabase } from './postgres-database.js';
import { decodeRecord, encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

// The session timeline tables of one transaction; `changed` tells the
// transaction runner to reach the SessionTimelineCommit crash points.
export class PostgresSessionTimelineTransaction implements SessionTimelineTransaction {
  readonly sessions: PostgresSessionRecords;
  readonly idempotency: PostgresIdempotencyRecords;

  constructor(session: Session) {
    this.sessions = new PostgresSessionRecords(session);
    this.idempotency = new PostgresIdempotencyRecords(session);
  }

  get changed(): boolean {
    return this.sessions.changed || this.idempotency.changed;
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
