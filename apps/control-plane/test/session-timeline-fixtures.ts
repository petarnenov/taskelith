import { createHash, randomUUID } from 'node:crypto';
import { SessionTimelineService, parseTurnId, type SessionTimelineStore, type SessionTimelineTransaction } from '@taskelith/execution';
import { err, failure, instantFromEpochMilliseconds, parseIdentifier, type FailureCode } from '@taskelith/kernel';
import { HmacInputDigest, SecretOutputRedactor, SecretTextRedactor, outputTailCipher } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

const DIGEST_KEY = Buffer.alloc(32, 0x5a);
const TAIL_KEY = Buffer.alloc(32, 0x3c);

// The service as the control plane composes it, with fixed keys and random
// turn and item IDs.
export function timelineService(store: SessionTimelineStore): SessionTimelineService {
  return new SessionTimelineService({
    store, digest: value(HmacInputDigest.fromKey(DIGEST_KEY)), redactor: new SecretTextRedactor(),
    outputRedactor: new SecretOutputRedactor(), tailCipher: value(outputTailCipher(TAIL_KEY)),
    turnIds: { next: () => value(parseTurnId(`t${randomUUID().replaceAll('-', '')}`)) },
    clock: { now: () => value(instantFromEpochMilliseconds(Date.now())) },
    itemIds: { next: () => value(parseIdentifier('NeedsYouItemId', `n${randomUUID()}`)) },
    ...commandDependencies(),
  });
}

// As the composition gives them, with the test's own log of unread turns.
export function commandDependencies(unread: readonly string[] = []) {
  const log: string[] = [...unread];
  return {
    commandIdDigest: (identifier: string): string => createHash('sha256').update(identifier, 'utf8').digest('hex'),
    commandLog: { turnWithoutReader: (turn: { readonly turnId: string }): void => void log.push(turn.turnId) },
    taskBranchRef: (taskId: string): string => `refs/heads/taskelith/${taskId}`,
  };
}

// The service over one open transaction, as an observation's effect gets it.
export function timelineOver(transaction: SessionTimelineTransaction): SessionTimelineService {
  return timelineService({ transaction: (work) => work(transaction) });
}

type TimelineStoreName = keyof SessionTimelineTransaction;

// The transaction's timelines with one call of one store answered as a
// failure of the given code, as a store that refuses a row answers.
export function failingAt(store: TimelineStoreName, call: string, code: FailureCode) {
  const fails = async () => err(failure(code, `the store refused ${store}.${call}`));
  const failingStore = (records: object) => new Proxy(records, {
    get: (target, name) => (name === call ? fails : (Reflect.get(target, name) as (...values: unknown[]) => unknown).bind(target)),
  });
  return (stores: SessionTimelineTransaction): SessionTimelineTransaction => new Proxy(stores, {
    get: (target, name) => (name === store ? failingStore(Reflect.get(target, name) as object) : Reflect.get(target, name)),
  });
}

export interface SessionObservationSource {
  readonly workerId: string;
  readonly journalId: string;
  readonly sequence: number;
  readonly attemptId: string;
  readonly ownershipGeneration: number;
  // The command a not-delivered or acceptance-unknown report answers, or
  // the counter of a generation's limit signals.
  readonly commandId?: string;
  readonly signal?: number;
  // Stands for a host that derived the same fact under another identity.
  readonly derivedAgain?: boolean;
}

type SessionPayload = Readonly<Record<string, unknown>> & {
  readonly sessionId?: string; readonly generation?: number; readonly turnId?: string; readonly chunk?: number;
  readonly request?: { readonly generation: number; readonly nativeRequestId: string };
};

// The source of each identity (worker messages contract, section 9, the
// table's last column); the worker's own derivation is item 18's.
function identitySource(type: string, payload: SessionPayload, source: SessionObservationSource): readonly unknown[] {
  const { sessionId, generation, turnId, request, chunk } = payload;
  switch (type) {
    case 'session.generation.started':
    case 'session.generation.ended':
      return [sessionId, generation, type];
    case 'session.turn.delivered':
      return [turnId, generation, type];
    case 'session.turn.not-delivered':
    case 'session.turn.acceptance-unknown':
      return ['command-outcome', source.commandId ?? `command-${turnId}-${generation}`];
    case 'session.turn.ended':
      return [turnId, type];
    case 'session.request.recorded':
    case 'session.response.delivery-reported':
      return [sessionId, request?.generation, request?.nativeRequestId, type];
    case 'session.output.appended':
      return [sessionId, generation, chunk, type];
    default:
      return [sessionId, generation, source.signal ?? 1, type];
  }
}

// A session observation as the consumer delivers it, at protocol version 2.
export function sessionObservationMessage(type: string, payload: SessionPayload, source: SessionObservationSource) {
  const { workerId, journalId, sequence, attemptId, ownershipGeneration } = source;
  const identity = [...identitySource(type, payload, source), ...(source.derivedAgain === true ? ['derived-again'] : [])];
  const observationId = `obs-${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
  const metadata = {
    observationId, observationType: type, schemaVersion: 1, protocolVersion: 2, occurredAt: '2026-10-25T09:00:00.000Z',
    correlationId: 'correlation-session', workerId, journalId, sequence, attemptId, ownershipGeneration,
  };
  return { subjectWorkerId: workerId, type, body: { metadata, payload } };
}
