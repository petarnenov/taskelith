import type { Result } from '@taskelith/kernel';
import type { EvidenceReference } from '@taskelith/sdlc';
import { notImplemented, type LimitSignal, type Session } from './session-records.js';

export function isStopped(session: Session): boolean {
  return notImplemented(session);
}

export function recordLimitSignal(session: Session, signal: LimitSignal): Session {
  return notImplemented(session, signal);
}

export function writeHandoff(session: Session, evidence: EvidenceReference): Result<Session> {
  return notImplemented(session, evidence);
}

export function takeHandoff(stopped: Session, taker: Session): Result<Session> {
  return notImplemented(stopped, taker);
}
