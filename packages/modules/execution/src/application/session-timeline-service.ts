import { err, failure, ok, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import type { Clock, EvidenceReference, TaskId } from '@taskelith/sdlc';
import { splitToLength, truncatedToLength, truncatedToUtf8Bytes, utf8Length } from '../domain/bounded-text.js';
import { MAX_HARNESS_TEXT_LENGTH } from '../domain/harness-values.js';
import type { AttemptId, IdempotencyKey, SessionGeneration, SessionId } from '../domain/identifiers.js';
import { bindAttempt, endBoundAttempt, endGeneration, startGeneration } from '../domain/session-attempts.js';
import { recordLimitSignal, takeHandoff, writeHandoff } from '../domain/session-handoff.js';
import { dueCommands, withCommandId, type CommandIdDigest } from '../domain/session-commands.js';
import { appendOutput, checkOutputTurn, liveTurnOf, readOutputAfter } from '../domain/session-output.js';
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
  type OutputEntry,
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
  checkStandingRuleOperation,
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
import { MAX_INPUT_ANSWER_BYTES, type NeedsYouItemId } from '../ports/needs-you.js';
import type { ScopedInboxItem, SessionInboxItem } from '../ports/session-inbox-items.js';
import type { InputDigest, OutputTailCipher, SessionOutputRedactor, SessionTextRedactor, TurnIdSource } from '../ports/session-input.js';
import type { SessionScope } from '../ports/session-scopes.js';
import type {
  HeldKey,
  IdempotencyRecord,
  SessionCommandLog,
  SessionTimelineStore,
  SessionTimelineTransaction,
  StoredSession,
} from '../ports/session-timeline-store.js';
import { NOTHING_HELD, SealedOutputTails, type TailOwner } from './sealed-output-tails.js';
import { itemChanges, type ItemChange } from './session-item-changes.js';
import { NATIVE_REQUEST_SOURCE_ID, nativeRequestItem, publishItem } from './native-request-items.js';
import { sessionEvents } from './session-events.js';
import { viewOf, type SessionView } from './session-views.js';

export type { OutputBounds, SessionView } from './session-views.js';

// `clock` and `itemIds` stamp the native request items that each change
// opens or settles in its own transaction.
export interface SessionTimelineDependencies {
  readonly store: SessionTimelineStore;
  readonly digest: InputDigest;
  readonly redactor: SessionTextRedactor;
  readonly outputRedactor: SessionOutputRedactor;
  readonly tailCipher: OutputTailCipher;
  readonly turnIds: TurnIdSource;
  readonly clock: Clock;
  readonly itemIds: { next(): NeedsYouItemId };
  readonly commandIdDigest: CommandIdDigest;
  readonly commandLog: SessionCommandLog;
  // The full ref of the branch the task's change pushes (`refs/heads/...`).
  readonly taskBranchRef: (taskId: TaskId) => string;
}

// A page of retained output after a cursor (wire contracts, section 9).
export type OutputPage =
  | { readonly kind: 'entries'; readonly entries: readonly OutputEntry[]; readonly more: boolean }
  | { readonly kind: 'cursor-expired'; readonly earliestRetained: number };

export interface TurnCommand {
  readonly key: IdempotencyKey;
  readonly author: TurnAuthor;
  readonly text: string;
}

export interface ResponseCommand {
  readonly key: IdempotencyKey;
  readonly response: ResponseSubmission;
}

export interface CardSessionPage {
  readonly sessions: readonly SessionView[];
  // Whether the card has sessions after the page's last one.
  readonly more: boolean;
}

export interface SubmittedTurn {
  readonly session: SessionView;
  readonly turn: Turn;
  readonly effect: TurnSubmitted['effect'];
}

export const KEY_REUSED = 'idempotency-key-reused';
// The reasons of the wire (control-plane wire contracts, section 9).
export const ALREADY_ANSWERED = 'already-answered';
export const ATTEMPT_NOT_CURRENT = 'attempt-not-current';
export const SESSION_STOPPED = 'session-stopped';
export const ITEM_CLOSED = 'item-closed';
const TURN_SCOPE = 'turn';

type Change = (session: Session) => Result<Session>;

// Applies each change of a session through the domain in one store
// transaction and answers only after it committed (contract, section 5.1).
export class SessionTimelineService {
  readonly #store: SessionTimelineStore;
  readonly #digest: InputDigest;
  readonly #redactor: SessionTextRedactor;
  readonly #outputRedactor: SessionOutputRedactor;
  readonly #tails: SealedOutputTails;
  readonly #turnIds: TurnIdSource;
  readonly #clock: Clock;
  readonly #itemIds: { next(): NeedsYouItemId };
  readonly #commandIdDigest: CommandIdDigest;
  readonly #commandLog: SessionCommandLog;
  readonly #taskBranchRef: (taskId: TaskId) => string;

  constructor(dependencies: SessionTimelineDependencies) {
    this.#store = dependencies.store;
    this.#digest = dependencies.digest;
    this.#redactor = dependencies.redactor;
    this.#outputRedactor = dependencies.outputRedactor;
    this.#tails = new SealedOutputTails(dependencies.tailCipher);
    this.#turnIds = dependencies.turnIds;
    this.#clock = dependencies.clock;
    this.#itemIds = dependencies.itemIds;
    this.#commandIdDigest = dependencies.commandIdDigest;
    this.#commandLog = dependencies.commandLog;
    this.#taskBranchRef = dependencies.taskBranchRef;
  }

  openSession(start: SessionStart): Promise<Result<SessionView>> {
    return this.#store.transaction(async (tx) => {
      const session = openSession(start);
      const added = await tx.sessions.add(session);
      if (!added.ok) return added;
      const published = await this.#published(tx, undefined, session);
      return published.ok ? ok(viewOf(session)) : published;
    });
  }

  // The task's other sessions are read in the same transaction (3.2).
  bindAttempt(sessionId: SessionId, binding: AttemptBinding): Promise<Result<SessionView>> {
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const taskSessions = await tx.sessions.listByTask(stored.value.session.taskId);
      if (!taskSessions.ok) return taskSessions;
      return this.#written(tx, stored.value, bindAttempt(stored.value.session, binding, taskSessions.value));
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
      const text = this.#redacted(command.text);
      const submitted = submitTurn(stored.value.session, { turnId: this.#turnIds.next(), key: command.key, author: command.author, text });
      if (!submitted.ok) return withReason(submitted.error, TURN_REASONS);
      const key = { scope: TURN_SCOPE, key: command.key, digest, outcome: submitted.value.turn.id };
      const recorded = await tx.idempotency.record(sessionId, key);
      if (!recorded.ok) return recorded;
      const replaced = await this.#written(tx, stored.value, ok(submitted.value.session));
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

  // Committed before any read lists the request (contract, section 5.1). A
  // held key is compared by the digest of the unredacted recording.
  recordRequest(sessionId: SessionId, recording: RequestRecording): Promise<Result<SessionView>> {
    if (!isTextWithin(recording.text, 0, MAX_HARNESS_TEXT_LENGTH)) {
      return Promise.resolve(err(failure('invalid', `session ${sessionId} got request text out of bounds`, { session: sessionId })));
    }
    const key = recording.key.nativeRequestId;
    const scope = requestScope(recording.key);
    const digest = this.#digest.digest(requestInput(recording));
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const prior = await tx.idempotency.find(sessionId, scope, key);
      if (!prior.ok) return prior;
      if (prior.value !== undefined) return repeatedRequest(stored.value.session, prior.value, digest);
      const redacted = { ...recording, text: this.#redacted(recording.text) };
      const recorded = recordRequest(stored.value.session, redacted);
      if (!recorded.ok) return recorded;
      const held = await tx.idempotency.record(sessionId, { scope, key, digest, outcome: recording.turnId });
      return held.ok ? this.#written(tx, stored.value, recorded) : held;
    });
  }

  // A response's key is scoped to its request; a repeat with the same digest
  // of answer, responder, and attempt returns the answered request.
  consumeResponse(sessionId: SessionId, command: ResponseCommand): Promise<Result<NativeRequest>> {
    const { request, answer } = command.response;
    if (!isAnswerWithinServiceBounds(answer)) {
      return Promise.resolve(err(failure('invalid', `session ${sessionId} got an answer out of bounds`, { session: sessionId })));
    }
    const scope = responseScope(request);
    const digest = this.#digest.digest(responseInput(command.response));
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const prior = await tx.idempotency.find(sessionId, scope, command.key);
      if (!prior.ok) return prior;
      if (prior.value !== undefined) {
        return prior.value.digest === digest ? requestOf(stored.value.session, request) : keyReused(sessionId, command.key);
      }
      const consumed = await this.#consumed(tx, stored.value, command.response);
      if (!consumed.ok) return consumed;
      const recorded = await tx.idempotency.record(sessionId, { scope, key: command.key, digest });
      return recorded.ok ? requestOf(consumed.value, request) : recorded;
    });
  }

  // Consumes a new response through the domain and writes its session.
  async #consumed(tx: SessionTimelineTransaction, stored: StoredSession, response: ResponseSubmission): Promise<Result<SessionView>> {
    const consumed = consumeResponse(stored.session, { ...response, answer: this.#redactedAnswer(response.answer) });
    if (!consumed.ok) return withReason(consumed.error, RESPONSE_REASONS);
    const operation = checkStandingRuleOperation(stored.session, response, this.#taskBranchRef(stored.session.taskId));
    if (!operation.ok) return operation;
    return this.#written(tx, stored, consumed);
  }

  // An inbox answer of a request's item (wire contracts, section 8): its key
  // is scoped to the item, and the item's state is read in its transaction.
  answerItem(itemId: NeedsYouItemId, command: ResponseCommand): Promise<Result<ScopedInboxItem>> {
    const { answer } = command.response;
    if (!isAnswerWithinServiceBounds(answer)) return Promise.resolve(err(failure('invalid', `item ${itemId} got an answer out of bounds`)));
    const scope = itemKeyScope(itemId);
    const digest = this.#digest.digest(responseInput(command.response));
    return this.#store.transaction(async (tx) => {
      const scoped = await itemOf(tx, itemId);
      if (!scoped.ok) return scoped;
      const { sessionId } = scoped.value.item;
      const prior = await tx.idempotency.find(sessionId, scope, command.key);
      if (!prior.ok) return prior;
      if (prior.value !== undefined) return prior.value.digest === digest ? scoped : keyReused(sessionId, command.key);
      const open = openItem(scoped.value);
      if (!open.ok) return open;
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const consumed = await this.#consumed(tx, stored.value, command.response);
      if (!consumed.ok) return consumed.error.code === 'not-found' ? itemClosed(itemId) : consumed;
      const recorded = await tx.idempotency.record(sessionId, { scope, key: command.key, digest });
      return recorded.ok ? itemOf(tx, itemId) : recorded;
    });
  }

  recordDeliveryReport(sessionId: SessionId, key: RequestKey, report: DeliveryReport): Promise<Result<SessionView>> {
    return this.#change(sessionId, (session) => recordDeliveryReport(session, key, report));
  }

  // A turn's output is redacted as one text: what could still be or start
  // a secret stays in the sealed held tail (wire contracts, section 7).
  appendOutput(sessionId: SessionId, output: OutputAppend): Promise<Result<SessionView>> {
    if (!isTextWithin(output.text, 0, MAX_HARNESS_TEXT_LENGTH)) {
      return Promise.resolve(err(failure('invalid', `session ${sessionId} got output text out of bounds`, { session: sessionId })));
    }
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const live = checkOutputTurn(stored.value.session, output);
      if (!live.ok) return live;
      const tail = await this.#tails.read(tx, sessionId);
      if (!tail.ok) return tail;
      if (tail.value !== undefined && !isSameOwner(tail.value, output)) return strayTail(sessionId);
      const split = this.#outputRedactor.split(tail.value?.held ?? NOTHING_HELD, output.text, MAX_HARNESS_TEXT_LENGTH);
      const written = await this.#tails.write(tx, sessionId, output, split.held, tail.value);
      if (!written.ok) return written;
      return this.#written(tx, stored.value, appendedOutput(stored.value.session, output, split.released));
    });
  }

  // The retained output after `after`, at most `limit` entries, read in one
  // transaction; a cursor past the last position fails with `invalid`.
  readOutput(sessionId: SessionId, after: number, limit: number): Promise<Result<OutputPage>> {
    return this.#store.transaction(async (tx): Promise<Result<OutputPage>> => {
      const stored = await storedSession(tx, sessionId);
      if (!stored.ok) return stored;
      const read = readOutputAfter(stored.value.session, after);
      if (!read.ok) return read;
      if (read.value.kind === 'cursor-expired') return ok(read.value);
      const { entries } = read.value;
      return ok(Object.freeze({ kind: 'entries' as const, entries: Object.freeze(entries.slice(0, limit)), more: entries.length > limit }));
    });
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
      return this.#written(tx, stopped.value, takeHandoff(stopped.value.session, taker.value.session));
    });
  }

  readSession(sessionId: SessionId): Promise<Result<SessionView>> {
    return this.#read(sessionId, viewOf);
  }

  // The card's sessions after `after`, listed and read in one transaction,
  // so that the page shows one state (wire contracts, sections 8 and 9).
  readCardSessions(scope: SessionScope, after: SessionId | undefined, limit: number): Promise<Result<CardSessionPage>> {
    return this.#store.transaction(async (tx) => {
      const listed = await tx.scopes.listByCard(scope, after, limit + 1);
      if (!listed.ok) return listed;
      const views: SessionView[] = [];
      for (const sessionId of listed.value.slice(0, limit)) {
        const stored = await storedSession(tx, sessionId);
        if (!stored.ok) return stored;
        views.push(viewOf(stored.value.session));
      }
      return ok(Object.freeze({ sessions: Object.freeze(views), more: listed.value.length > limit }));
    });
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
      if (!stored.ok) return stored;
      return this.#written(tx, stored.value, await this.#changedAfterRelease(tx, stored.value.session, change));
    });
  }

  // A change that ends the live turn first releases its held tail, redacted,
  // as the turn's last output, then applies to that session (decision 3).
  async #changedAfterRelease(tx: SessionTimelineTransaction, session: Session, change: Change): Promise<Result<Session>> {
    const changed = change(session);
    const live = liveTurnOf(session);
    if (!changed.ok || live === undefined || liveTurnOf(changed.value)?.id === live.id) return changed;
    const tail = await this.#tails.read(tx, session.id);
    if (!tail.ok) return tail;
    if (tail.value === undefined) return changed;
    if (tail.value.turnId !== live.id) return strayTail(session.id);
    const released = appendedOutput(session, tail.value, this.#outputRedactor.release(tail.value.held));
    if (!released.ok) return released;
    const cleared = await tx.tails.clear(session.id);
    return cleared.ok ? change(released.value) : cleared;
  }

  #read<Value>(sessionId: SessionId, read: (session: Session) => Value): Promise<Result<Value>> {
    return this.#store.transaction(async (tx) => {
      const stored = await storedSession(tx, sessionId);
      return stored.ok ? ok(read(stored.value.session)) : stored;
    });
  }

  // Writes the changed session, the items its requests open or settle, and
  // the events of both in one transaction; an unchanged one writes nothing.
  async #written(tx: SessionTimelineTransaction, stored: StoredSession, changed: Result<Session>): Promise<Result<SessionView>> {
    if (!changed.ok) return changed;
    if (changed.value === stored.session) return ok(viewOf(changed.value));
    const commanded = await this.#withDueCommands(tx, stored.session, changed.value);
    if (!commanded.ok) return commanded;
    const replaced = await tx.sessions.replace(stored, commanded.value);
    if (!replaced.ok) return replaced;
    const published = await this.#published(tx, stored.session, commanded.value);
    if (!published.ok) return published;
    for (const item of itemChanges(stored.session, commanded.value, this.#clock.now())) {
      const applied = await this.#applyItemChange(tx, commanded.value, item, published.value);
      if (!applied.ok) return applied;
    }
    return ok(viewOf(commanded.value));
  }

  // Writes the commands the change made due, and answers the session that
  // stores their IDs; a command that no worker reads stores none.
  async #withDueCommands(tx: SessionTimelineTransaction, before: Session, after: Session): Promise<Result<Session>> {
    let session = after;
    for (const due of dueCommands(before, after, this.#commandIdDigest)) {
      const appended = await tx.commands.append(due.command, this.#clock.now());
      if (!appended.ok) return appended;
      if (appended.value === 'written') {
        session = withCommandId(session, due);
      } else if (due.kind === 'response') {
        return responseWithoutReader(after.id);
      } else {
        this.#commandLog.turnWithoutReader({ sessionId: after.id, turnId: due.turnId, generation: due.generation, attemptId: due.command.attemptId });
      }
    }
    return ok(session);
  }

  // The session's events, none for a session outside any project's scope;
  // answers the scope for the events of its items.
  async #published(tx: SessionTimelineTransaction, before: Session | undefined, after: Session): Promise<Result<SessionScope | undefined>> {
    const scope = await tx.scopes.scopeOf(after.id);
    if (!scope.ok || scope.value === undefined) return scope;
    for (const event of sessionEvents(before, after, scope.value, this.#clock.now())) {
      const appended = await tx.events.append(event);
      if (!appended.ok) return appended;
    }
    return scope;
  }

  async #applyItemChange(
    tx: SessionTimelineTransaction, session: Session, item: ItemChange, scope: SessionScope | undefined,
  ): Promise<Result<void>> {
    const written = await this.#writtenItem(tx, session, item);
    if (!written.ok) return written;
    return publishItem(tx.events, nativeRequestItem(NATIVE_REQUEST_SOURCE_ID, { item: written.value, scope }), this.#clock.now());
  }

  async #writtenItem(tx: SessionTimelineTransaction, session: Session, item: ItemChange): Promise<Result<SessionInboxItem>> {
    if (item.change === 'open') {
      const { kind, request, attemptId, attemptGeneration } = item;
      const opened: SessionInboxItem = Object.freeze({
        id: this.#itemIds.next(), kind, sessionId: session.id, taskId: session.taskId, request, createdAt: this.#clock.now(), state: 'open',
        ...(attemptId === undefined ? {} : { attemptId }), ...(attemptGeneration === undefined ? {} : { attemptGeneration }),
      });
      const added = await tx.items.add(opened);
      return added.ok ? ok(opened) : added;
    }
    const open = await tx.items.find(session.id, item.kind, item.request);
    if (!open.ok) return open;
    if (open.value === undefined) return err(failure('internal', `session ${session.id} lost the item of a request`, { session: session.id }));
    const { state: _state, ...fields } = open.value;
    const settled = { ...fields, ...item.state } as SessionInboxItem;
    const written = await tx.items.settle(settled);
    return written.ok ? ok(settled) : written;
  }

  // Redaction may lengthen a text past its bound, so only its tail is cut,
  // and no redacted secret can reappear (design decision 6).
  #redacted(text: string): string {
    return truncatedToLength(this.#redactor.redact(text), MAX_HARNESS_TEXT_LENGTH);
  }

  #redactedAnswer(answer: Answer): Answer {
    switch (answer.kind) {
      case 'permission':
        return answer.message === undefined ? answer : { ...answer, message: this.#redacted(answer.message) };
      case 'input':
        return { ...answer, text: truncatedToUtf8Bytes(this.#redactor.redact(answer.text), MAX_INPUT_ANSWER_BYTES) };
      case 'delegation-result':
        return { ...answer, summary: this.#redacted(answer.summary) };
    }
  }
}

// Released text past the entry bound becomes several entries, split on
// whole characters, so that none of it is lost (design decision 4).
function appendedOutput(session: Session, owner: TailOwner, released: string): Result<Session> {
  let appended = session;
  for (const text of splitToLength(released, MAX_HARNESS_TEXT_LENGTH)) {
    const next = appendOutput(appended, { turnId: owner.turnId, generation: owner.generation, text });
    if (!next.ok) return next;
    appended = next.value;
  }
  return ok(appended);
}

function isSameOwner(left: TailOwner, right: TailOwner): boolean {
  return left.turnId === right.turnId && left.generation === right.generation;
}

// Each tail is released before its turn stops running, so another turn's
// tail means the store broke that rule.
function strayTail(sessionId: SessionId): Result<never> {
  return err(failure('internal', `session ${sessionId} holds the output tail of another turn`, { session: sessionId }));
}

async function storedSession(tx: SessionTimelineTransaction, sessionId: SessionId): Promise<Result<StoredSession>> {
  const stored = await tx.sessions.get(sessionId);
  if (!stored.ok) return stored;
  if (stored.value === undefined) return err(failure('not-found', `no session ${sessionId}`, { session: sessionId }));
  return ok(stored.value);
}

// On these paths each failure code has one meaning, which the wire names.
const TURN_REASONS: Partial<Record<FailureCode, string>> = Object.freeze({ 'precondition-failed': SESSION_STOPPED });
const RESPONSE_REASONS: Partial<Record<FailureCode, string>> = Object.freeze({
  conflict: ALREADY_ANSWERED, 'precondition-failed': ATTEMPT_NOT_CURRENT,
});

function withReason(failed: Failure, reasons: Partial<Record<FailureCode, string>>): Result<never> {
  const reason = reasons[failed.code];
  if (reason === undefined || failed.details.reason !== undefined) return err(failed);
  return err(failure(failed.code, failed.message, { ...failed.details, reason }));
}

function repeatedTurn(session: Session, prior: IdempotencyRecord, digest: string): Result<SubmittedTurn> {
  if (prior.digest !== digest) return keyReused(session.id, prior.key);
  const turn = session.turns.find((candidate) => candidate.id === prior.outcome);
  if (turn === undefined) return err(failure('internal', `session ${session.id} lost the turn of the key ${prior.key}`));
  return ok(Object.freeze({ session: viewOf(session), turn, effect: 'duplicate' as const }));
}

// Only the open request's change makes a response due, so a response that
// no worker can read is refused and stays open (contract, section 5.2 rule 9).
function responseWithoutReader(sessionId: SessionId): Result<never> {
  return err(failure('unavailable', `session ${sessionId} has no worker that can read a response now`, { session: sessionId }));
}

// A held request key with another digest fails as the domain's conflict.
function repeatedRequest(session: Session, prior: IdempotencyRecord, digest: string): Result<SessionView> {
  if (prior.digest === digest) return ok(viewOf(session));
  return err(failure('conflict', `session ${session.id} holds another request under this key`, { session: session.id }));
}

async function itemOf(tx: SessionTimelineTransaction, itemId: NeedsYouItemId): Promise<Result<ScopedInboxItem>> {
  const scoped = await tx.items.get(itemId);
  if (!scoped.ok) return scoped;
  return scoped.value === undefined ? err(failure('not-found', `no inbox item ${itemId}`)) : ok(scoped.value);
}

// A resolved item was answered first; a closed one takes no answer.
function openItem({ item }: ScopedInboxItem): Result<void> {
  if (item.state === 'resolved') return err(failure('conflict', `item ${item.id} is resolved`, { reason: ALREADY_ANSWERED }));
  return item.state === 'closed' ? itemClosed(item.id) : ok(undefined);
}

export function itemClosed(itemId: NeedsYouItemId): Result<never> {
  return err(failure('precondition-failed', `item ${itemId} is closed`, { reason: ITEM_CLOSED }));
}

// An inbox answer's key is scoped to its item (wire contracts, section 8).
export function itemKeyScope(itemId: NeedsYouItemId): string {
  return `item:${itemId}`;
}

function requestOf(session: Pick<Session, 'id' | 'requests'>, key: RequestKey): Result<NativeRequest> {
  const request = session.requests.find((candidate) => isSameRequestKey(candidate.key, key));
  if (request === undefined) return err(failure('internal', `session ${session.id} lost the request of a response key`));
  return ok(request);
}

function keyReused(sessionId: SessionId, key: HeldKey): Result<never> {
  return err(failure('conflict', `session ${sessionId} holds the key ${key} with other input`, { session: sessionId, reason: KEY_REUSED }));
}


// An input answer is also bounded in UTF-8 bytes (MAX_INPUT_ANSWER_BYTES).
function isAnswerWithinServiceBounds(answer: Answer): boolean {
  if (!isAnswerWithinBounds(answer)) return false;
  return answer.kind !== 'input' || utf8Length(answer.text) <= MAX_INPUT_ANSWER_BYTES;
}

function responseScope(key: RequestKey): string {
  return `response:${key.generation}:${key.nativeRequestId}`;
}

// A native request's key is its native request ID within its generation.
function requestScope(key: RequestKey): string {
  return `request:${key.generation}`;
}

// The digested inputs, in a fixed field order so equal inputs digest alike.
function turnInput(command: TurnCommand): string {
  const { author } = command;
  const by = author.kind === 'principal'
    ? ['principal', author.principalId]
    : ['host', author.delegationRequest.generation, author.delegationRequest.nativeRequestId];
  return JSON.stringify(['turn', by, command.text]);
}

function requestInput(recording: RequestRecording): string {
  const { kind, turnId, text, operation } = recording;
  return JSON.stringify(['request', kind, turnId, text, ...(operation === undefined ? [] : [operation.kind, operation.ref])]);
}

function responseInput(response: ResponseSubmission): string {
  const { answer, responder, attemptId, ownershipGeneration } = response;
  return JSON.stringify(['response', answerFields(answer), responderFields(responder), attemptId, ownershipGeneration]);
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
