import { parseIdentifier } from '@taskelith/kernel';
import type { OwnershipGeneration, TaskId } from '@taskelith/sdlc';
import {
  bindAttempt,
  deliverTurn,
  openSession,
  parseSessionGeneration,
  recordRequest,
  startGeneration,
  submitTurn,
  type AttemptBinding,
  type AttemptId,
  type IdempotencyKey,
  type NativeRequestId,
  type NativeSessionId,
  type RequestKey,
  type RequestRecording,
  type ResponseSubmission,
  type Session,
  type SessionGeneration,
  type SessionId,
  type TurnId,
} from '@taskelith/execution';
import { value } from '@taskelith/testing';
import { attemptId, ownership } from './fixtures.ts';

export const sessionId = (text: string): SessionId => value(parseIdentifier('SessionId', text));
export const turnId = (text: string): TurnId => value(parseIdentifier('TurnId', text));
export const turnKey = (text: string): IdempotencyKey => value(parseIdentifier('IdempotencyKey', text));
export const nativeSessionId = (text: string): NativeSessionId => value(parseIdentifier('NativeSessionId', text));
export const nativeRequestId = (text: string): NativeRequestId => value(parseIdentifier('NativeRequestId', text));
export const taskId = (text: string): TaskId => value(parseIdentifier('TaskId', text));
export const generation = (number: number): SessionGeneration => value(parseSessionGeneration(number));

export const SESSION = sessionId('session-1');
export const OTHER_SESSION = sessionId('session-2');
export const TASK = taskId('task-1');
export const CHILD_TASK = taskId('task-1-child');
export const HARNESS = value(parseIdentifier('HarnessPluginId', 'harness-a'));
export const NATIVE = nativeSessionId('native-1');
export const AUTHOR = value(parseIdentifier('PrincipalId', 'person-1'));
export const FIRST_ATTEMPT = attemptId('attempt-1');
export const SECOND_ATTEMPT = attemptId('attempt-2');
export const OWNERSHIP = ownership(1);

export function binding(id: AttemptId = FIRST_ATTEMPT, owner: OwnershipGeneration = OWNERSHIP, task: TaskId = TASK): AttemptBinding {
  return { attemptId: id, taskId: task, ownershipGeneration: owner };
}

export function newSession(id: SessionId = SESSION, task: TaskId = TASK): Session {
  return openSession({ id, taskId: task, harness: HARNESS });
}

// A session of TASK with FIRST_ATTEMPT bound and generation 1 running.
export function runningSession(): Session {
  const bound = value(bindAttempt(newSession(), binding(), []));
  return value(startGeneration(bound, { generation: generation(1), nativeSessionId: NATIVE }));
}

export function submitted(session: Session, name: string, text = `text of ${name}`): Session {
  const submission = { turnId: turnId(name), key: turnKey(`key-${name}`), author: AUTHOR, text };
  return value(submitTurn(session, submission)).session;
}

export function delivered(session: Session, name: string, at = 1): Session {
  return value(deliverTurn(submitted(session, name), { turnId: turnId(name), generation: generation(at) }));
}

// A session whose turn `turn-1` runs in generation 1.
export function sessionWithRunningTurn(): Session {
  return delivered(runningSession(), 'turn-1');
}

export function requestKey(native: string, at = 1): RequestKey {
  return { generation: generation(at), nativeRequestId: nativeRequestId(native) };
}

export function permissionRequest(native: string, turn = 'turn-1', at = 1): RequestRecording {
  return { key: requestKey(native, at), kind: 'permission-request', turnId: turnId(turn), text: `may I ${native}` };
}

// A session whose running turn has the open permission request `request-1`.
export function sessionWithOpenRequest(): Session {
  return value(recordRequest(sessionWithRunningTurn(), permissionRequest('request-1')));
}

export function allow(native = 'request-1', at = 1): ResponseSubmission {
  return {
    request: requestKey(native, at),
    answer: { kind: 'permission', decision: 'allow' },
    responder: { kind: 'principal', principalId: AUTHOR },
    attemptId: FIRST_ATTEMPT,
    ownershipGeneration: OWNERSHIP,
  };
}
