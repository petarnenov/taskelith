import { ok, type Result } from '@taskelith/kernel';
import type { EvidenceReference } from '@taskelith/sdlc';
import {
  frozenCopy,
  runningGeneration,
  sessionFailure,
  withChanges,
  type Handoff,
  type LimitSignal,
  type Session,
} from './session-records.js';

// Stops the session at its slot's limit; a later signal adds a reset time
// that the stop lacks (contract, section 8).
export function recordLimitSignal(session: Session, signal: LimitSignal): Session {
  if (session.limit?.resetsAt !== undefined) return session;
  if (session.limit !== undefined && signal.resetsAt === undefined) return session;
  return withChanges(session, { limit: frozenCopy({ resetsAt: signal.resetsAt }) });
}

// Writes the host's handoff once the stopped session's generation ended.
export function writeHandoff(session: Session, evidence: EvidenceReference): Result<Session> {
  if (session.limit === undefined) return sessionFailure('precondition-failed', session, 'is not stopped');
  if (runningGeneration(session) !== undefined) return sessionFailure('precondition-failed', session, 'has a running generation');
  if (session.handoff !== undefined) return sessionFailure('conflict', session, 'already wrote its handoff');
  const handoff: Handoff = {
    sessionId: session.id,
    taskId: session.taskId,
    harness: session.harness,
    resetsAt: session.limit.resetsAt,
    lastTurnWithOutcome: [...session.turns].reverse().find((turn) => turn.state === 'ended')?.id,
    unresolvedRequests: session.requests.filter((request) => request.state === 'unresolved').map((request) => request.key),
    evidence,
  };
  return ok(withChanges(session, { handoff: frozenCopy(handoff) }));
}

// Gives the handoff to the next session of the task, once.
export function takeHandoff(stopped: Session, taker: Session): Result<Session> {
  const { handoff } = stopped;
  if (handoff === undefined) return sessionFailure('not-found', stopped, 'has no handoff');
  if (taker.taskId !== stopped.taskId) return sessionFailure('conflict', stopped, `hands off only to task ${stopped.taskId}`);
  if (taker.id === stopped.id) return sessionFailure('conflict', stopped, 'cannot take its own handoff');
  if (handoff.takenBy !== undefined) return sessionFailure('conflict', stopped, `handed off to ${handoff.takenBy}`);
  return ok(withChanges(stopped, { handoff: Object.freeze({ ...handoff, takenBy: taker.id }) }));
}
