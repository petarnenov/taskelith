import { ok, type Result } from '@taskelith/kernel';
import { MAX_HARNESS_TEXT_LENGTH } from './harness-values.js';
import type { SessionGeneration } from './identifiers.js';
import {
  appended,
  isRunningIn,
  isStopped,
  isTextWithin,
  replaced,
  runningGeneration,
  sessionFailure,
  withChanges,
  type Session,
  type SessionLimit,
  type Turn,
  type TurnDelivery,
  type TurnEnd,
  type TurnSubmission,
  type TurnSubmitted,
} from './session-records.js';
import { expireRequestsOf } from './session-requests.js';

const UNTIMED_LIMIT: SessionLimit = Object.freeze({});

// Records a user turn once per idempotency key (contract, section 4.1).
export function submitTurn(session: Session, submission: TurnSubmission): Result<TurnSubmitted> {
  if (!isTextWithin(submission.text, 1, MAX_HARNESS_TEXT_LENGTH)) return sessionFailure('invalid', session, 'got turn text out of bounds');
  const same = session.turns.find((turn) => turn.key === submission.key);
  if (same !== undefined) {
    if (!isRetryOf(same, submission)) return sessionFailure('conflict', session, `holds key ${submission.key} with other input`);
    return ok(Object.freeze({ session, turn: same, effect: 'duplicate' }));
  }
  if (findTurn(session, submission).turn !== undefined) return sessionFailure('conflict', session, `holds turn ${submission.turnId}`);
  if (isStopped(session)) return sessionFailure('precondition-failed', session, 'is stopped');
  const { turnId: id, key, author, text } = submission;
  const turn: Turn = Object.freeze({ id, key, author, text, position: session.turns.length + 1, state: 'queued' });
  return ok(Object.freeze({ session: withChanges(session, { turns: appended(session.turns, turn) }), turn, effect: 'recorded' }));
}

// The earliest queued turn, when the session can deliver a turn now.
export function nextDeliverableTurn(session: Session): Turn | undefined {
  if (isStopped(session) || runningGeneration(session) === undefined || hasRunningTurn(session)) return undefined;
  return session.turns.find((turn) => turn.state === 'queued');
}

export function deliverTurn(session: Session, delivery: TurnDelivery): Result<Session> {
  const { index, turn } = findTurn(session, delivery);
  if (turn === undefined) return sessionFailure('not-found', session, `has no turn ${delivery.turnId}`);
  if (turn.state !== 'queued') return sessionFailure('precondition-failed', session, `holds turn ${turn.id} as ${turn.state}`);
  if (runningGeneration(session)?.generation !== delivery.generation) {
    return sessionFailure('precondition-failed', session, `does not run generation ${delivery.generation}`);
  }
  if (nextDeliverableTurn(session)?.id !== turn.id) return sessionFailure('precondition-failed', session, `cannot deliver ${turn.id} now`);
  const delivered: Turn = { ...turn, state: 'delivered', generation: delivery.generation };
  return ok(withChanges(session, { turns: replaced(session.turns, index, delivered) }));
}

// Records a turn's one outcome; its open requests expire (section 4.3).
export function recordTurnOutcome(session: Session, end: TurnEnd): Result<Session> {
  if ((end.outcome === 'failed') !== (end.failure !== undefined)) {
    return sessionFailure('invalid', session, 'needs a failure exactly with a failed outcome');
  }
  const { index, turn } = findTurn(session, end);
  if (turn === undefined) return sessionFailure('not-found', session, `has no turn ${end.turnId}`);
  if (turn.state === 'ended' || turn.state === 'outcome-unknown') return sessionFailure('conflict', session, `ended turn ${turn.id}`);
  if (!isRunningIn(turn, end.generation)) {
    return sessionFailure('precondition-failed', session, `does not run turn ${turn.id} in generation ${end.generation}`);
  }
  const ended: Turn = { ...turn, state: 'ended', generation: end.generation, outcome: end.outcome, failure: end.failure };
  const changes = { turns: replaced(session.turns, index, ended), requests: expireRequestsOf(session.requests, turn.id) };
  const stops = end.outcome === 'account-limit-reached' && !isStopped(session);
  return ok(withChanges(session, stops ? { ...changes, limit: UNTIMED_LIMIT } : changes));
}

// A generation's end leaves its delivered turns outcome-unknown (section 6).
export function reconcileTurns(turns: readonly Turn[], generation: SessionGeneration): readonly Turn[] {
  return Object.freeze(turns.map((turn) => (
    isRunningIn(turn, generation) ? Object.freeze({ ...turn, state: 'outcome-unknown' as const, generation }) : turn
  )));
}

// Product ports contract, section 2 rule 7: a retry repeats the input.
function isRetryOf(turn: Turn, submission: TurnSubmission): boolean {
  return turn.text === submission.text && turn.author === submission.author;
}

function hasRunningTurn(session: Session): boolean {
  return session.turns.some((turn) => turn.state === 'delivered');
}

function findTurn(session: Session, named: { readonly turnId: Turn['id'] }): { index: number; turn: Turn | undefined } {
  const index = session.turns.findIndex((turn) => turn.id === named.turnId);
  return { index, turn: session.turns[index] };
}
