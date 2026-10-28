import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import type { AttemptId, IdempotencyKey, SessionId } from '../domain/identifiers.js';
import type { Session } from '../domain/session-records.js';
import type {
  IdempotencyRecord,
  IdempotencyRecords,
  SessionRecords,
  SessionTimelineStore,
  SessionTimelineTransaction,
  StoredSession,
} from '../ports/session-timeline-store.js';

interface State {
  readonly sessions: Map<SessionId, StoredSession>;
  readonly attempts: Map<AttemptId, SessionId>;
  readonly keys: Map<string, IdempotencyRecord>;
}

function copy(state: State): State {
  return { sessions: new Map(state.sessions), attempts: new Map(state.attempts), keys: new Map(state.keys) };
}

// One transaction at a time over a copy of the state, which replaces the
// state only when the work answers ok.
export class InMemorySessionTimelineStore implements SessionTimelineStore {
  #state: State = { sessions: new Map(), attempts: new Map(), keys: new Map() };
  #queue: Promise<unknown> = Promise.resolve();

  transaction<Value>(work: (tx: SessionTimelineTransaction) => Promise<Result<Value>>): Promise<Result<Value>> {
    const run = async (): Promise<Result<Value>> => {
      const draft = copy(this.#state);
      const result = await work({ sessions: new MemorySessionRecords(draft), idempotency: new MemoryIdempotencyRecords(draft) });
      if (result.ok) this.#state = draft;
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}

class MemorySessionRecords implements SessionRecords {
  constructor(private readonly state: State) {}

  async get(id: SessionId): Promise<Result<StoredSession | undefined>> {
    return ok(this.state.sessions.get(id));
  }

  async add(session: Session): Promise<Result<void>> {
    if (this.state.sessions.has(session.id)) return err(failure('conflict', `the session ${session.id} exists`));
    return this.#store(session, 1);
  }

  async replace(stored: StoredSession, next: Session): Promise<Result<void>> {
    const current = this.state.sessions.get(stored.session.id);
    if (current?.version !== stored.version || next.id !== stored.session.id) {
      return err(failure('conflict', `the session ${stored.session.id} changed since version ${stored.version}`));
    }
    return this.#store(next, stored.version + 1);
  }

  async listByTask(taskId: TaskId): Promise<Result<readonly Session[]>> {
    const sessions = [...this.state.sessions.values()].map((stored) => stored.session).filter((session) => session.taskId === taskId);
    return ok(Object.freeze(sessions.sort((left, right) => compareCodeUnits(left.id, right.id))));
  }

  #store(session: Session, version: number): Result<void> {
    const taken = session.attempts.find((attempt) => (this.state.attempts.get(attempt.id) ?? session.id) !== session.id);
    if (taken !== undefined) return err(failure('conflict', `another session binds the attempt ${taken.id}`));
    for (const attempt of session.attempts) this.state.attempts.set(attempt.id, session.id);
    this.state.sessions.set(session.id, Object.freeze({ session, version }));
    return ok(undefined);
  }
}

class MemoryIdempotencyRecords implements IdempotencyRecords {
  constructor(private readonly state: State) {}

  async find(sessionId: SessionId, scope: string, key: IdempotencyKey): Promise<Result<IdempotencyRecord | undefined>> {
    return ok(this.state.keys.get(keyOf(sessionId, scope, key)));
  }

  async record(sessionId: SessionId, record: IdempotencyRecord): Promise<Result<void>> {
    const at = keyOf(sessionId, record.scope, record.key);
    if (this.state.keys.has(at)) return err(failure('conflict', `the session ${sessionId} holds the key ${record.key}`));
    this.state.keys.set(at, Object.freeze({ ...record }));
    return ok(undefined);
  }
}

function keyOf(sessionId: SessionId, scope: string, key: IdempotencyKey): string {
  return JSON.stringify([sessionId, scope, key]);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
