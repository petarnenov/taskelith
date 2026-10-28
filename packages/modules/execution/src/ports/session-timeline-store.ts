import type { Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { IdempotencyKey, SessionId } from '../domain/identifiers.js';
import type { Session } from '../domain/session-records.js';

// Session timelines with the idempotency keys of their commands. Each
// transaction commits its writes only when the work answers ok.
export interface SessionTimelineStore {
  transaction<Value>(work: (tx: SessionTimelineTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

export interface SessionTimelineTransaction {
  readonly sessions: SessionRecords;
  readonly idempotency: IdempotencyRecords;
}

// A stored session with the version that a replacement must name.
export interface StoredSession {
  readonly session: Session;
  readonly version: number;
}

// `add` and `replace` are `conflict` for a taken session ID, a stale
// version, or an attempt that another session binds.
export interface SessionRecords {
  get(id: SessionId): Promise<Result<StoredSession | undefined>>;
  add(session: Session): Promise<Result<void>>;
  replace(stored: StoredSession, next: Session): Promise<Result<void>>;
  // The task's sessions, in session ID order.
  listByTask(taskId: TaskId): Promise<Result<readonly Session[]>>;
}

// A command's key within its session and scope, with the keyed digest of
// its unredacted input and the identity of its first outcome.
export interface IdempotencyRecord {
  readonly scope: string;
  readonly key: IdempotencyKey;
  readonly digest: string;
  readonly outcome: string;
}

// `record` is `conflict` for a key its session and scope already hold.
export interface IdempotencyRecords {
  find(sessionId: SessionId, scope: string, key: IdempotencyKey): Promise<Result<IdempotencyRecord | undefined>>;
  record(sessionId: SessionId, record: IdempotencyRecord): Promise<Result<void>>;
}
