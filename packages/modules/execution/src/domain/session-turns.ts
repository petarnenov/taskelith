import type { Result } from '@taskelith/kernel';
import {
  notImplemented,
  type Session,
  type Turn,
  type TurnDelivery,
  type TurnEnd,
  type TurnSubmission,
  type TurnSubmitted,
} from './session-records.js';

export function submitTurn(session: Session, submission: TurnSubmission): Result<TurnSubmitted> {
  return notImplemented(session, submission);
}

export function nextDeliverableTurn(session: Session): Turn | undefined {
  return notImplemented(session);
}

export function deliverTurn(session: Session, delivery: TurnDelivery): Result<Session> {
  return notImplemented(session, delivery);
}

export function recordTurnOutcome(session: Session, end: TurnEnd): Result<Session> {
  return notImplemented(session, end);
}
