import { ok, type Result } from '@taskelith/kernel';
import { MAX_HARNESS_TEXT_LENGTH } from './harness-values.js';
import type { SessionGeneration } from './identifiers.js';
import {
  appended,
  frozenCopy,
  isRunningIn,
  isSameRequestKey,
  isStopped,
  isTextWithin,
  replaced,
  runningGeneration,
  sessionFailure,
  withChanges,
  type Session,
  type SessionLimit,
  type Turn,
  type TurnAuthor,
  type TurnDelivery,
  type TurnEnd,
  type TurnReport,
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
  const accepted = acceptedAuthor(session, submission.author);
  if (!accepted.ok) return accepted;
  const { turnId: id, key, author, text } = submission;
  const turn: Turn = frozenCopy({ id, key, author, text, position: session.turns.length + 1, state: 'queued' });
  return ok(Object.freeze({ session: withChanges(session, { turns: appended(session.turns, turn) }), turn, effect: 'recorded' }));
}

// The earliest queued turn, when the session can deliver a turn now; a turn
// of unknown acceptance may still run in its generation (section 4.4).
export function nextDeliverableTurn(session: Session): Turn | undefined {
  const running = runningGeneration(session);
  if (isStopped(session) || running === undefined || hasRunningTurn(session, running.generation)) return undefined;
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
  if (isFinal(turn)) return sessionFailure('conflict', session, `ended turn ${turn.id}`);
  if (!isRunningIn(turn, end.generation)) {
    return sessionFailure('precondition-failed', session, `does not run turn ${turn.id} in generation ${end.generation}`);
  }
  const ended: Turn = { ...turn, state: 'ended', generation: end.generation, outcome: end.outcome, failure: end.failure };
  const changes = { turns: replaced(session.turns, index, ended), requests: expireRequestsOf(session.requests, turn.id) };
  const stops = end.outcome === 'account-limit-reached' && !isStopped(session);
  return ok(withChanges(session, stops ? { ...changes, limit: UNTIMED_LIMIT } : changes));
}

// The host cannot tell whether the port accepted the turn (section 4.4).
export function recordTurnAcceptanceUnknown(session: Session, report: TurnReport): Result<Session> {
  return recordFinalReport(session, report, 'outcome-unknown');
}

// The plugin refused the turn as `invalid`, so it never ran (section 4.5).
export function recordTurnRefused(session: Session, report: TurnReport): Result<Session> {
  return recordFinalReport(session, report, 'refused');
}

// A generation's end leaves its delivered turns outcome-unknown (section 6).
export function reconcileTurns(turns: readonly Turn[], generation: SessionGeneration): readonly Turn[] {
  return Object.freeze(turns.map((turn) => (
    isRunningIn(turn, generation) ? Object.freeze({ ...turn, state: 'outcome-unknown' as const, generation }) : turn
  )));
}

// The host writes only the outcome turn of a delegation request that no
// response can reach (agent harness port, 7.4; contract, section 4.1).
function acceptedAuthor(session: Session, author: TurnAuthor): Result<TurnAuthor> {
  if (author.kind === 'principal') return ok(author);
  const request = session.requests.find((candidate) => isSameRequestKey(candidate.key, author.delegationRequest));
  if (request === undefined) return sessionFailure('not-found', session, 'has no such delegation request');
  if (request.kind !== 'delegation-request') return sessionFailure('invalid', session, `takes no host turn for a ${request.kind}`);
  if (request.state !== 'expired' && request.state !== 'unresolved') {
    return sessionFailure('precondition-failed', session, `holds the delegation request as ${request.state}`);
  }
  return ok(author);
}

// Product ports contract, section 2 rule 7: a retry repeats the input.
function isRetryOf(turn: Turn, submission: TurnSubmission): boolean {
  return turn.text === submission.text && isSameAuthor(turn.author, submission.author);
}

function isSameAuthor(left: TurnAuthor, right: TurnAuthor): boolean {
  if (left.kind === 'principal') return right.kind === 'principal' && left.principalId === right.principalId;
  return right.kind === 'host' && isSameRequestKey(left.delegationRequest, right.delegationRequest);
}

function hasRunningTurn(session: Session, running: SessionGeneration): boolean {
  return session.turns.some((turn) => turn.state === 'delivered' || (turn.state === 'outcome-unknown' && turn.generation === running));
}

function isFinal(turn: Turn): boolean {
  return turn.state === 'ended' || turn.state === 'outcome-unknown' || turn.state === 'refused';
}

// Both reports take only the earliest queued turn, also after its generation
// ended or the session stopped; the same state again is a repeat.
function recordFinalReport(session: Session, report: TurnReport, state: 'outcome-unknown' | 'refused'): Result<Session> {
  const { index, turn } = findTurn(session, report);
  if (turn === undefined) return sessionFailure('not-found', session, `has no turn ${report.turnId}`);
  if (!session.generations.some((run) => run.generation === report.generation)) {
    return sessionFailure('not-found', session, `has no generation ${report.generation}`);
  }
  if (turn.state === state) return ok(session);
  if (turn.state !== 'queued') return sessionFailure('conflict', session, `holds turn ${turn.id} as ${turn.state}`);
  if (session.turns.find((candidate) => candidate.state === 'queued')?.id !== turn.id) {
    return sessionFailure('precondition-failed', session, `holds an earlier queued turn than ${turn.id}`);
  }
  const reported: Turn = { ...turn, state, generation: report.generation };
  return ok(withChanges(session, { turns: replaced(session.turns, index, reported) }));
}

function findTurn(session: Session, named: { readonly turnId: Turn['id'] }): { index: number; turn: Turn | undefined } {
  const index = session.turns.findIndex((turn) => turn.id === named.turnId);
  return { index, turn: session.turns[index] };
}
