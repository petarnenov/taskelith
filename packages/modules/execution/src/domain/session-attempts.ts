import type { Result } from '@taskelith/kernel';
import type { AttemptId, SessionGeneration } from './identifiers.js';
import {
  notImplemented,
  type AttemptBinding,
  type BoundAttempt,
  type GenerationRun,
  type GenerationStart,
  type Session,
} from './session-records.js';

export function bindAttempt(session: Session, binding: AttemptBinding, taskSessions: readonly Session[]): Result<Session> {
  return notImplemented(session, binding, taskSessions);
}

export function endBoundAttempt(session: Session, attemptId: AttemptId): Result<Session> {
  return notImplemented(session, attemptId);
}

export function activeBoundAttempt(session: Session): BoundAttempt | undefined {
  return notImplemented(session);
}

export function startGeneration(session: Session, start: GenerationStart): Result<Session> {
  return notImplemented(session, start);
}

export function endGeneration(session: Session, generation: SessionGeneration): Result<Session> {
  return notImplemented(session, generation);
}

export function runningGeneration(session: Session): GenerationRun | undefined {
  return notImplemented(session);
}
