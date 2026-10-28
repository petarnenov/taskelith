import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { EvidenceReference } from '@taskelith/sdlc';
import { MAX_HARNESS_TEXT_LENGTH } from '../domain/harness-values.js';
import type { AttemptId, IdempotencyKey, SessionGeneration, SessionId } from '../domain/identifiers.js';
import { bindAttempt, endBoundAttempt, endGeneration, startGeneration } from '../domain/session-attempts.js';
import { recordLimitSignal, takeHandoff, writeHandoff } from '../domain/session-handoff.js';
import { appendOutput } from '../domain/session-output.js';
import {
  isSameRequestKey,
  isTextWithin,
  openSession,
  type Answer,
  type AttemptBinding,
  type DeliveryReport,
  type GenerationStart,
  type LimitSignal,
  type NativeRequest,
  type OutputAppend,
  type RequestKey,
  type RequestRecording,
  type Responder,
  type ResponseSubmission,
  type Session,
  type SessionStart,
  type Turn,
  type TurnAuthor,
  type TurnDelivery,
  type TurnEnd,
  type TurnReport,
  type TurnSubmitted,
} from '../domain/session-records.js';
import {
  consumeResponse,
  isAnswerWithinBounds,
  recordDeliveryReport,
  recordRequest,
  requestsAwaitingAnswer,
  uncertainDeliveries,
} from '../domain/session-requests.js';
import {
  deliverTurn,
  nextDeliverableTurn,
  recordTurnAcceptanceUnknown,
  recordTurnOutcome,
  recordTurnRefused,
  submitTurn,
} from '../domain/session-turns.js';
import type { InputDigest, SessionTextRedactor, TurnIdSource } from '../ports/session-input.js';
import type {
  IdempotencyRecord,
  SessionTimelineStore,
  SessionTimelineTransaction,
  StoredSession,
} from '../ports/session-timeline-store.js';

export interface SessionTimelineDependencies {
  readonly store: SessionTimelineStore;
  readonly digest: InputDigest;
  readonly redactor: SessionTextRedactor;
  readonly turnIds: TurnIdSource;
}

// A session as the service shows it: its output stays in the store until
// item 13b redacts output across chunks (coordinator answer Q5).
export type SessionView = Omit<Session, 'output'>;

export interface TurnCommand {
  readonly key: IdempotencyKey;
  readonly author: TurnAuthor;
  readonly text: string;
}

export interface ResponseCommand {
  readonly key: IdempotencyKey;
  readonly response: ResponseSubmission;
}

export interface SubmittedTurn {
  readonly session: SessionView;
  readonly turn: Turn;
  readonly effect: TurnSubmitted['effect'];
}

export const KEY_REUSED = 'idempotency-key-reused';
const TURN_SCOPE = 'turn';

type Change = (session: Session) => Result<Session>;

// Applies each change of a session through the domain in one store
// transaction and answers only after it committed (contract, section 5.1).
export class SessionTimelineService {
  readonly #store: SessionTimelineStore;
  readonly #digest: InputDigest;
  readonly #redactor: SessionTextRedactor;
  readonly #turnIds: TurnIdSource;

  constructor(dependencies: SessionTimelineDependencies) {
    this.#store = dependencies.store;
    this.#digest = dependencies.digest;
    this.#redactor = dependencies.redactor;
    this.#turnIds = dependencies.turnIds;
  }

  openSession(start: SessionStart): Promise<Result<SessionView>> {
    return this.#store.transaction(async (tx) => {
      const session = openSession(start);
      const added = await tx.sessions.add(session);
      return added.ok ? ok(viewOf(session)) : added;
    });
  }

  // The task's other sessions are read in the same transaction (3.2).
  bindAttempt(sessionId: SessionId, binding: AttemptBinding): Promise<Result<SessionView>> {
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const taskSessions = await tx.sessions.listByTask(stored.value.session.taskId);
      if (!taskSessions.ok) return taskSessions;
      return written(tx, stored.value, bindAttempt(stored.value.session, binding, taskSessions.value));
    });
  }

  endBoundAttempt(sessionId: SessionId, attemptId: AttemptId): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => endBoundAttempt(session, attemptId));
  }

  startGeneration(sessionId: SessionId, start: GenerationStart): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => startGeneration(session, start));
  }

  endGeneration(sessionId: SessionId, generation: SessionGeneration): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => endGeneration(session, generation));
  }

  // A repeated key is resolved before the domain by the digest of the
  // unredacted author and text (control-plane wire contracts, section 7).
  submitTurn(sessionId: SessionId, command: TurnCommand): Promise<Result<SubmittedTurn>> {
    if (!isTextWithin(command.text, 1, MAX_HARNESS_TEXT_LENGTH)) {
      return Promise.resolve(err(failure('invalid', `session ${sessionId} got turn text out of bounds`, { session: sessionId })));
    }
    const digest = this.#digest.digest(turnInput(command));
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const prior = await tx.idempotency.find(sessionId, TURN_SCOPE, command.key);
      if (!prior.ok) return prior;
      if (prior.value !== undefined) return repeatedTurn(stored.value.session, prior.value, digest);
      const text = this.#redactor.redact(command.text);
      const submitted = submitTurn(stored.value.session, { turnId: this.#turnIds.next(), key: command.key, author: command.author, text });
      if (!submitted.ok) return submitted;
      const key = { scope: TURN_SCOPE, key: command.key, digest, outcome: submitted.value.turn.id };
      const recorded = await tx.idempotency.record(sessionId, key);
      if (!recorded.ok) return recorded;
      const replaced = await written(tx, stored.value, ok(submitted.value.session));
      return replaced.ok ? ok(Object.freeze({ ...submitted.value, session: replaced.value })) : replaced;
    });
  }

  deliverTurn(sessionId: SessionId, delivery: TurnDelivery): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => deliverTurn(session, delivery));
  }

  recordTurnOutcome(sessionId: SessionId, end: TurnEnd): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => recordTurnOutcome(session, end));
  }

  recordTurnAcceptanceUnknown(sessionId: SessionId, report: TurnReport): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => recordTurnAcceptanceUnknown(session, report));
  }

  recordTurnRefused(sessionId: SessionId, report: TurnReport): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => recordTurnRefused(session, report));
  }

  // Committed before any read lists the request (contract, section 5.1).
  recordRequest(sessionId: SessionId, recording: RequestRecording): Promise<Result<SessionView>> {
    const redacted = { ...recording, text: this.#redactor.redact(recording.text) };
    return this.#change(sessionId, (session) => recordRequest(session, redacted));
  }

  // A response's key is scoped to its request; a repeat with the same digest
  // of answer and responder returns the answered request.
  consumeResponse(sessionId: SessionId, command: ResponseCommand): Promise<Result<NativeRequest>> {
    const { request, answer, responder } = command.response;
    if (!isAnswerWithinBounds(answer)) {
      return Promise.resolve(err(failure('invalid', `session ${sessionId} got an answer out of bounds`, { session: sessionId })));
    }
    const scope = responseScope(request);
    const digest = this.#digest.digest(responseInput(answer, responder));
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const prior = await tx.idempotency.find(sessionId, scope, command.key);
      if (!prior.ok) return prior;
      if (prior.value !== undefined) {
        return prior.value.digest === digest ? requestOf(stored.value.session, request) : keyReused(sessionId, command.key);
      }
      const consumed = consumeResponse(stored.value.session, { ...command.response, answer: this.#redactedAnswer(answer) });
      if (!consumed.ok) return consumed;
      const recorded = await tx.idempotency.record(sessionId, { scope, key: command.key, digest, outcome: scope });
      if (!recorded.ok) return recorded;
      const replaced = await written(tx, stored.value, consumed);
      return replaced.ok ? requestOf(consumed.value, request) : replaced;
    });
  }

  recordDeliveryReport(sessionId: SessionId, key: RequestKey, report: DeliveryReport): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => recordDeliveryReport(session, key, report));
  }

  // Each chunk is redacted alone until item 13b holds a tail across chunks.
  appendOutput(sessionId: SessionId, output: OutputAppend): Promise<Result<SessionView>> {
    const redacted = { ...output, text: this.#redactor.redact(output.text) };
    return this.#change(sessionId, (session) => appendOutput(session, redacted));
  }

  recordLimitSignal(sessionId: SessionId, signal: LimitSignal): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => ok(recordLimitSignal(session, signal)));
  }

  writeHandoff(sessionId: SessionId, evidence: EvidenceReference): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => writeHandoff(session, evidence));
  }

  takeHandoff(stoppedId: SessionId, takerId: SessionId): Promise<Result<SessionView>> {
    return this.#store.transaction(async (tx) => {
      const taker = await storedSession(tx, takerId);
      if (!taker.ok) return taker;
      const stopped = await storedSession(tx, stoppedId);
      if (!stopped.ok) return stopped;
      return written(tx, stopped.value, takeHandoff(stopped.value.session, taker.value.session));
    });
  }

  readSession(sessionId: SessionId): Promise<Result<SessionView>> {
    return this.#read(sessionId, viewOf);
  }

  nextDeliverableTurn(sessionId: SessionId): Promise<Result<Turn | undefined>> {
    return this.#read(sessionId, nextDeliverableTurn);
  }

  requestsAwaitingAnswer(sessionId: SessionId): Promise<Result<readonly NativeRequest[]>> {
    return this.#read(sessionId, requestsAwaitingAnswer);
  }

  uncertainDeliveries(sessionId: SessionId): Promise<Result<readonly NativeRequest[]>> {
    return this.#read(sessionId, uncertainDeliveries);
  }

  #change(sessionId: SessionId, change: Change): Promise<Result<SessionView>> {
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      return stored.ok ? written(tx, stored.value, change(stored.value.session)) : stored;
    });
  }

  #read<Value>(sessionId: SessionId, read: (session: Session) => Value): Promise<Result<Value>> {
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      return stored.ok ? ok(read(stored.value.session)) : stored;
    });
  }

  #redactedAnswer(answer: Answer): Answer {
    const redact = (text: string) => this.#redactor.redact(text);
    switch (answer.kind) {
      case 'permission':
        return answer.message === undefined ? answer : { ...answer, message: redact(answer.message) };
      case 'input':
        return { ...answer, text: redact(answer.text) };
      case 'delegation-result':
        return { ...answer, summary: redact(answer.summary) };
    }
  }
}

async function storedSession(tx: SessionTimelineTransaction, sessionId: SessionId): Promise<Result<StoredSession>> {
  const stored = await tx.sessions.get(sessionId);
  if (!stored.ok) return stored;
  if (stored.value === undefined) return err(failure('not-found', `no session ${sessionId}`, { session: sessionId }));
  return ok(stored.value);
}

// Writes the changed session; a repeat that the domain answered with the
// unchanged session writes nothing.
async function written(tx: SessionTimelineTransaction, stored: StoredSession, changed: Result<Session>): Promise<Result<SessionView>> {
  if (!changed.ok) return changed;
  if (changed.value === stored.session) return ok(viewOf(changed.value));
  const replaced = await tx.sessions.replace(stored, changed.value);
  return replaced.ok ? ok(viewOf(changed.value)) : replaced;
}

function repeatedTurn(session: Session, prior: IdempotencyRecord, digest: string): Result<SubmittedTurn> {
  if (prior.digest !== digest) return keyReused(session.id, prior.key);
  const turn = session.turns.find((candidate) => candidate.id === prior.outcome);
  if (turn === undefined) return err(failure('internal', `session ${session.id} lost the turn of the key ${prior.key}`));
  return ok(Object.freeze({ session: viewOf(session), turn, effect: 'duplicate' as const }));
}

function requestOf(session: Session, key: RequestKey): Result<NativeRequest> {
  const request = session.requests.find((candidate) => isSameRequestKey(candidate.key, key));
  if (request === undefined) return err(failure('internal', `session ${session.id} lost the request of a response key`));
  return ok(request);
}

function keyReused(sessionId: SessionId, key: IdempotencyKey): Result<never> {
  return err(failure('conflict', `session ${sessionId} holds the key ${key} with other input`, { session: sessionId, reason: KEY_REUSED }));
}

function viewOf(session: Session): SessionView {
  const { output: _output, ...view } = session;
  return Object.freeze(view);
}

function responseScope(key: RequestKey): string {
  return `response:${key.generation}:${key.nativeRequestId}`;
}

// The digested inputs, in a fixed field order so equal inputs digest alike.
function turnInput(command: TurnCommand): string {
  const { author } = command;
  const by = author.kind === 'principal'
    ? ['principal', author.principalId]
    : ['host', author.delegationRequest.generation, author.delegationRequest.nativeRequestId];
  return JSON.stringify(['turn', by, command.text]);
}

function responseInput(answer: Answer, responder: Responder): string {
  return JSON.stringify(['response', answerFields(answer), responderFields(responder)]);
}

function responderFields(responder: Responder): readonly unknown[] {
  switch (responder.kind) {
    case 'principal':
      return ['principal', responder.principalId];
    case 'standing-rule':
      return ['standing-rule', responder.ruleId];
    case 'host':
      return ['host'];
  }
}

function answerFields(answer: Answer): readonly unknown[] {
  switch (answer.kind) {
    case 'permission':
      return ['permission', answer.decision, answer.message ?? null];
    case 'input':
      return ['input', answer.text];
    case 'delegation-result':
      return ['delegation-result', answer.delegationId, answer.outcome, answer.summary];
  }
}
