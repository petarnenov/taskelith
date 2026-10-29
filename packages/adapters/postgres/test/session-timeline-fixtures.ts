import { randomUUID } from 'node:crypto';
import {
  SessionTimelineService,
  parseSessionGeneration,
  parseTurnId,
  type IdempotencyKey,
  type RequestKey,
  type RequestRecording,
  type ResponseCommand,
  type SessionGeneration,
  type SessionId,
  type SessionTimelineStore,
  type SessionTimelineTransaction,
  type TurnAuthor,
  type TurnCommand,
  type TurnId,
} from '@taskelith/execution';
import { instantFromEpochMilliseconds, parseIdentifier } from '@taskelith/kernel';
import { PostgresSessionTimelineStore, type PostgresDatabase } from '@taskelith/postgres';
import { parseOwnershipGeneration, type TaskId } from '@taskelith/sdlc';
import { HmacInputDigest, SecretTextRedactor } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

export const SESSION = value(parseIdentifier('SessionId', 'session-1')) as SessionId;
export const OTHER_SESSION = value(parseIdentifier('SessionId', 'session-2')) as SessionId;
export const TASK = value(parseIdentifier('TaskId', 'task-1')) as TaskId;
export const HARNESS = value(parseIdentifier('HarnessPluginId', 'harness-a'));
export const NATIVE = value(parseIdentifier('NativeSessionId', 'native-1'));
export const ATTEMPT = value(parseIdentifier('AttemptId', 'attempt-1'));
export const OTHER_ATTEMPT = value(parseIdentifier('AttemptId', 'attempt-2'));
export const OWNERSHIP = value(parseOwnershipGeneration(1));
export const OTHER_OWNERSHIP = value(parseOwnershipGeneration(2));
// Two URLs whose passwords differ and redact to the same text.
export const FIRST_URL = 'https://bot:first-pass@example.com/repo';
export const OTHER_URL = 'https://bot:other-pass@example.com/repo';
export const PERSON: TurnAuthor = { kind: 'principal', principalId: value(parseIdentifier('PrincipalId', 'person-1')) };
export const OTHER_PERSON: TurnAuthor = { kind: 'principal', principalId: value(parseIdentifier('PrincipalId', 'person-2')) };
const DIGEST_KEY = Buffer.alloc(32, 0x5a);

export const generation = (number: number): SessionGeneration => value(parseSessionGeneration(number));
export const key = (text: string): IdempotencyKey => value(parseIdentifier('IdempotencyKey', text));
export const turnId = (text: string): TurnId => value(parseIdentifier('TurnId', text));

export function turn(name: string, text = `text of ${name}`, author: TurnAuthor = PERSON): TurnCommand {
  return { key: key(name), author, text };
}

export function requestKey(native: string, at = 1): RequestKey {
  return { generation: generation(at), nativeRequestId: value(parseIdentifier('NativeRequestId', native)) };
}

export function permissionRequest(native: string, turnName: string, at = 1): RequestRecording {
  return { key: requestKey(native, at), kind: 'permission-request', turnId: turnId(turnName), text: `may I ${native}` };
}

export function allow(name: string, native = 'request-1', decision: 'allow' | 'deny' = 'allow'): ResponseCommand {
  return {
    key: key(name),
    response: {
      request: requestKey(native), answer: { kind: 'permission', decision }, responder: PERSON, attemptId: ATTEMPT, ownershipGeneration: OWNERSHIP,
    },
  };
}

// The service as a control plane runs it, with a fixed digest key and
// random turn and item IDs, as each process mints its own.
export function timelineService(store: SessionTimelineStore): SessionTimelineService {
  return new SessionTimelineService({
    store, digest: value(HmacInputDigest.fromKey(DIGEST_KEY)), redactor: new SecretTextRedactor(),
    turnIds: { next: () => value(parseTurnId(`t${randomUUID().replaceAll('-', '')}`)) },
    clock: { now: () => value(instantFromEpochMilliseconds(Date.now())) },
    itemIds: { next: () => value(parseIdentifier('NeedsYouItemId', `n${randomUUID()}`)) },
  });
}

export function postgresService(database: PostgresDatabase): SessionTimelineService {
  return timelineService(new PostgresSessionTimelineStore(database));
}

// SESSION of TASK with ATTEMPT bound and generation 1 running.
export async function runningSession(service: SessionTimelineService, id: SessionId = SESSION): Promise<void> {
  value(await service.openSession({ id, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(id, { attemptId: ATTEMPT, taskId: TASK, ownershipGeneration: OWNERSHIP }));
  value(await service.startGeneration(id, { generation: generation(1), nativeSessionId: NATIVE }));
}

// Generation 1 runs the turn of key `turn-1` with the open `request-1`.
export async function sessionWithOpenRequest(service: SessionTimelineService): Promise<TurnId> {
  await runningSession(service);
  const submitted = value(await service.submitTurn(SESSION, turn('turn-1')));
  value(await service.deliverTurn(SESSION, { turnId: submitted.turn.id, generation: generation(1) }));
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-1', 'turn-1'), turnId: submitted.turn.id }));
  return submitted.turn.id;
}

// Parties wait until all have arrived; no timer decides an order.
export class Barrier {
  readonly #waiting: (() => void)[] = [];
  #remaining: number;

  constructor(parties: number) {
    this.#remaining = parties;
  }

  arrive(): Promise<void> {
    this.#remaining -= 1;
    const arrived = new Promise<void>((resolve) => this.#waiting.push(resolve));
    if (this.#remaining === 0) for (const release of this.#waiting) release();
    return arrived;
  }
}

// Each transaction of the first attempt waits at the barrier after its first
// session read, so every party has read before any writes.
export function barrierStore(store: SessionTimelineStore, barrier: Barrier): SessionTimelineStore {
  let arrived = false;
  return {
    transaction: (work) => store.transaction((tx) => work(gated(tx, async () => {
      if (arrived) return;
      arrived = true;
      await barrier.arrive();
    }))),
  };
}

function gated(tx: SessionTimelineTransaction, afterRead: () => Promise<void>): SessionTimelineTransaction {
  return {
    idempotency: tx.idempotency,
    items: tx.items,
    audit: tx.audit,
    sessions: {
      get: async (id) => {
        const read = await tx.sessions.get(id);
        await afterRead();
        return read;
      },
      add: (session) => tx.sessions.add(session),
      replace: (stored, next) => tx.sessions.replace(stored, next),
      listByTask: (taskId) => tx.sessions.listByTask(taskId),
    },
  };
}
