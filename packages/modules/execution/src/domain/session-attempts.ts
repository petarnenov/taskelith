import { ok, type Result } from '@taskelith/kernel';
import type { AttemptId, SessionGeneration } from './identifiers.js';
import {
  activeBoundAttempt,
  appended,
  isStopped,
  replaced,
  runningGeneration,
  sessionFailure,
  withChanges,
  type AttemptBinding,
  type BoundAttempt,
  type GenerationRun,
  type GenerationStart,
  type Session,
} from './session-records.js';
import { reconcileRequests } from './session-requests.js';
import { reconcileTurns } from './session-turns.js';

// Binds an attempt of the session's task while no bound attempt is active;
// taskSessions are the task's other sessions (contract, section 3.2).
export function bindAttempt(session: Session, binding: AttemptBinding, taskSessions: readonly Session[]): Result<Session> {
  if (binding.taskId !== session.taskId) return sessionFailure('conflict', session, `belongs to task ${session.taskId}`);
  if (holdsAttempt(session, binding.attemptId)) return sessionFailure('conflict', session, `already bound ${binding.attemptId}`);
  const holder = taskSessions.find((other) => other.id !== session.id && holdsAttempt(other, binding.attemptId));
  if (holder !== undefined) return sessionFailure('conflict', session, `cannot bind ${binding.attemptId} of ${holder.id}`);
  const active = activeBoundAttempt(session);
  if (active !== undefined) return sessionFailure('precondition-failed', session, `has the active attempt ${active.id}`);
  const attempt: BoundAttempt = { id: binding.attemptId, ownershipGeneration: binding.ownershipGeneration, ended: false };
  return ok(withChanges(session, { attempts: appended(session.attempts, attempt) }));
}

// Records the end of a bound attempt, which also ends its running generation.
export function endBoundAttempt(session: Session, attemptId: AttemptId): Result<Session> {
  const index = session.attempts.findIndex((attempt) => attempt.id === attemptId);
  const attempt = session.attempts[index];
  if (attempt === undefined) return sessionFailure('not-found', session, `never bound ${attemptId}`);
  if (attempt.ended) return ok(session);
  const ended = withChanges(session, { attempts: replaced(session.attempts, index, { ...attempt, ended: true }) });
  const runIndex = ended.generations.findIndex((run) => !run.ended);
  const run = ended.generations[runIndex];
  return ok(run === undefined ? ended : reconciled(ended, runIndex, run));
}

export function startGeneration(session: Session, start: GenerationStart): Result<Session> {
  if (isStopped(session)) return sessionFailure('precondition-failed', session, 'is stopped');
  const attempt = activeBoundAttempt(session);
  if (attempt === undefined) return sessionFailure('precondition-failed', session, 'has no active attempt');
  if (runningGeneration(session) !== undefined) return sessionFailure('precondition-failed', session, 'has a running generation');
  const next = session.generations.length + 1;
  if (start.generation !== next) return sessionFailure('precondition-failed', session, `starts generation ${next} next`);
  if (session.nativeSessionId !== undefined && session.nativeSessionId !== start.nativeSessionId) {
    return sessionFailure('conflict', session, `runs as native session ${session.nativeSessionId}`);
  }
  const run = { generation: start.generation, attemptId: attempt.id, ended: false };
  return ok(withChanges(session, { nativeSessionId: start.nativeSessionId, generations: appended(session.generations, run) }));
}

// Ends a generation and reconciles what it left open (contract, section 6).
export function endGeneration(session: Session, generation: SessionGeneration): Result<Session> {
  const index = session.generations.findIndex((candidate) => candidate.generation === generation);
  const run = session.generations[index];
  if (run === undefined) return sessionFailure('not-found', session, `has no generation ${generation}`);
  return ok(run.ended ? session : reconciled(session, index, run));
}

function reconciled(session: Session, index: number, run: GenerationRun): Session {
  return withChanges(session, {
    generations: replaced(session.generations, index, { ...run, ended: true }),
    turns: reconcileTurns(session.turns, run.generation),
    requests: reconcileRequests(session.requests, run.generation),
  });
}

function holdsAttempt(session: Session, attemptId: AttemptId): boolean {
  return session.attempts.some((attempt) => attempt.id === attemptId);
}
