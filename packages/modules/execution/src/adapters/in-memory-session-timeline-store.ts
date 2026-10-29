import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import type { AttemptId, SessionId } from '../domain/identifiers.js';
import { isSameRequestKey, type RequestKey, type Session } from '../domain/session-records.js';
import type { NeedsYouItemId } from '../ports/needs-you.js';
import type {
  ScopedInboxItem,
  SessionAuditEvent,
  SessionAuditRecords,
  SessionInboxItem,
  SessionInboxItems,
  SessionItemKind,
} from '../ports/session-inbox-items.js';
import type { SessionScope, SessionScopes } from '../ports/session-scopes.js';
import type {
  HeldKey,
  IdempotencyRecord,
  IdempotencyRecords,
  SessionRecords,
  SessionTimelineStore,
  SessionTimelineTransaction,
  StoredSession,
} from '../ports/session-timeline-store.js';

// The project and card of a task, as Scheduling's task lineage holds them.
export type TaskScopes = (taskId: TaskId) => SessionScope | undefined;

interface State {
  readonly sessions: Map<SessionId, StoredSession>;
  readonly attempts: Map<AttemptId, SessionId>;
  readonly keys: Map<string, IdempotencyRecord>;
  readonly items: Map<NeedsYouItemId, SessionInboxItem>;
  readonly audit: SessionAuditEvent[];
}

function copy(state: State): State {
  return {
    sessions: new Map(state.sessions), attempts: new Map(state.attempts), keys: new Map(state.keys), items: new Map(state.items),
    audit: [...state.audit],
  };
}

// One transaction at a time over a copy of the state, which replaces the
// state only when the work answers ok. Its scopes come from `taskScopes`.
export class InMemorySessionTimelineStore implements SessionTimelineStore, SessionScopes {
  #state: State = { sessions: new Map(), attempts: new Map(), keys: new Map(), items: new Map(), audit: [] };
  #queue: Promise<unknown> = Promise.resolve();
  readonly #taskScopes: TaskScopes;

  constructor(taskScopes: TaskScopes = () => undefined) {
    this.#taskScopes = taskScopes;
  }

  transaction<Value>(work: (tx: SessionTimelineTransaction) => Promise<Result<Value>>): Promise<Result<Value>> {
    const run = async (): Promise<Result<Value>> => {
      const draft = copy(this.#state);
      const result = await work({
        sessions: new MemorySessionRecords(draft), idempotency: new MemoryIdempotencyRecords(draft),
        items: new MemorySessionInboxItems(draft, (sessionId) => this.#scopeIn(draft, sessionId)), audit: new MemoryAuditRecords(draft),
      });
      if (result.ok) this.#state = draft;
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  // The audit events committed so far, oldest first.
  auditEvents(): readonly SessionAuditEvent[] {
    return Object.freeze([...this.#state.audit]);
  }

  async scopeOf(sessionId: SessionId): Promise<Result<SessionScope | undefined>> {
    return ok(this.#scopeIn(this.#state, sessionId));
  }

  async isCard(projectId: ProjectId, runId: WorkflowRunId): Promise<Result<boolean>> {
    const scopes = [...this.#state.sessions.values()].map((stored) => this.#taskScopes(stored.session.taskId));
    return ok(scopes.some((scope) => scope?.projectId === projectId && scope.runId === runId));
  }

  async listByCard(scope: SessionScope, after: SessionId | undefined, limit: number): Promise<Result<readonly SessionId[]>> {
    const ids = [...this.#state.sessions.keys()]
      .filter((id) => isSameScope(this.#scopeIn(this.#state, id), scope) && (after === undefined || compareCodeUnits(id, after) > 0))
      .sort(compareCodeUnits);
    return ok(Object.freeze(ids.slice(0, limit)));
  }

  #scopeIn(state: State, sessionId: SessionId): SessionScope | undefined {
    const stored = state.sessions.get(sessionId);
    return stored === undefined ? undefined : this.#taskScopes(stored.session.taskId);
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

  async find(sessionId: SessionId, scope: string, key: HeldKey): Promise<Result<IdempotencyRecord | undefined>> {
    return ok(this.state.keys.get(keyOf(sessionId, scope, key)));
  }

  async record(sessionId: SessionId, record: IdempotencyRecord): Promise<Result<void>> {
    const at = keyOf(sessionId, record.scope, record.key);
    if (this.state.keys.has(at)) return err(failure('conflict', `the session ${sessionId} holds the key ${record.key}`));
    this.state.keys.set(at, Object.freeze({ ...record }));
    return ok(undefined);
  }
}

class MemorySessionInboxItems implements SessionInboxItems {
  constructor(private readonly state: State, private readonly scopeOf: (sessionId: SessionId) => SessionScope | undefined) {}

  async find(sessionId: SessionId, kind: SessionItemKind, request: RequestKey): Promise<Result<SessionInboxItem | undefined>> {
    return ok([...this.state.items.values()].find((item) => isItemOf(item, sessionId, kind, request)));
  }

  async get(id: NeedsYouItemId): Promise<Result<ScopedInboxItem | undefined>> {
    const item = this.state.items.get(id);
    return ok(item === undefined ? undefined : this.#scoped(item));
  }

  async add(item: SessionInboxItem): Promise<Result<void>> {
    const taken = this.state.items.has(item.id) || [...this.state.items.values()].some((held) => isItemOf(held, item.sessionId, item.kind, item.request));
    if (taken) return err(failure('conflict', `the item ${item.id} or its request's item exists`));
    this.state.items.set(item.id, Object.freeze({ ...item }));
    return ok(undefined);
  }

  async settle(item: SessionInboxItem): Promise<Result<void>> {
    if (this.state.items.get(item.id)?.state !== 'open') return err(failure('conflict', `the item ${item.id} is not open`));
    this.state.items.set(item.id, Object.freeze({ ...item }));
    return ok(undefined);
  }

  async listOpen(projectId: ProjectId, after: NeedsYouItemId | undefined, limit: number): Promise<Result<readonly ScopedInboxItem[]>> {
    const open = [...this.state.items.values()]
      .filter((item) => item.state === 'open' && (after === undefined || compareCodeUnits(item.id, after) > 0))
      .map((item) => this.#scoped(item))
      .filter((scoped) => scoped.scope?.projectId === projectId)
      .sort((left, right) => compareCodeUnits(left.item.id, right.item.id));
    return ok(Object.freeze(open.slice(0, limit)));
  }

  #scoped(item: SessionInboxItem): ScopedInboxItem {
    const scope = this.scopeOf(item.sessionId);
    return Object.freeze(scope === undefined ? { item } : { item, scope });
  }
}

class MemoryAuditRecords implements SessionAuditRecords {
  constructor(private readonly state: State) {}

  async append(event: SessionAuditEvent): Promise<Result<void>> {
    this.state.audit.push(Object.freeze({ ...event }));
    return ok(undefined);
  }
}

function isItemOf(item: SessionInboxItem, sessionId: SessionId, kind: SessionItemKind, request: RequestKey): boolean {
  return item.sessionId === sessionId && item.kind === kind && isSameRequestKey(item.request, request);
}

function isSameScope(left: SessionScope | undefined, right: SessionScope): boolean {
  return left?.projectId === right.projectId && left.runId === right.runId;
}

function keyOf(sessionId: SessionId, scope: string, key: HeldKey): string {
  return JSON.stringify([sessionId, scope, key]);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
