import type { Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { IdempotencyKey, NativeRequestId, SessionGeneration, SessionId, TurnId } from '../domain/identifiers.js';
import type { Session } from '../domain/session-records.js';
import type { SessionAuditRecords, SessionInboxItems } from './session-inbox-items.js';
import type { SessionScopes } from './session-scopes.js';

// Session timelines with the idempotency keys of their commands. Each
// transaction commits its writes only when the work answers ok.
export interface SessionTimelineStore {
  transaction<Value>(work: (tx: SessionTimelineTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

export interface SessionTimelineTransaction {
  readonly sessions: SessionRecords;
  readonly idempotency: IdempotencyRecords;
  readonly items: SessionInboxItems;
  readonly audit: SessionAuditRecords;
  readonly scopes: SessionScopes;
  readonly tails: SessionOutputTails;
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

// A command's idempotency key, or a native request's ID as its own key.
export type HeldKey = IdempotencyKey | NativeRequestId;

// A held key within its session and scope, with the keyed digest of its
// unredacted input and its first outcome unless the scope names it.
export interface IdempotencyRecord {
  readonly scope: string;
  readonly key: HeldKey;
  readonly digest: string;
  readonly outcome?: string;
}

// `record` is `conflict` for a key its session and scope already hold.
export interface IdempotencyRecords {
  find(sessionId: SessionId, scope: string, key: HeldKey): Promise<Result<IdempotencyRecord | undefined>>;
  record(sessionId: SessionId, record: IdempotencyRecord): Promise<Result<void>>;
}

// A turn's held output tail at rest: only its ciphertext, sealed with the
// session, turn, and version as authenticated data.
export interface StoredOutputTail {
  readonly sessionId: SessionId;
  readonly turnId: TurnId;
  readonly generation: SessionGeneration;
  readonly version: number;
  readonly nonce: Uint8Array;
  readonly sealed: Uint8Array;
}

// At most one tail per session, read by no path but output's.
export interface SessionOutputTails {
  get(sessionId: SessionId): Promise<Result<StoredOutputTail | undefined>>;
  put(tail: StoredOutputTail): Promise<Result<void>>;
  clear(sessionId: SessionId): Promise<Result<void>>;
}
