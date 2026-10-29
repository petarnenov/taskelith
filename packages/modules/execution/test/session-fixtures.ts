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
  type OutputTailCipher,
  type RequestKey,
  type RequestRecording,
  type ResponseSubmission,
  type Session,
  type SessionGeneration,
  type SessionId,
  type SessionOutputRedactor,
  type TurnAuthor,
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
export const PERSON: TurnAuthor = { kind: 'principal', principalId: AUTHOR };
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
  const submission = { turnId: turnId(name), key: turnKey(`key-${name}`), author: PERSON, text };
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

export function recordedRequest(session: Session, recording: RequestRecording): Session {
  return value(recordRequest(session, recording));
}

// A session whose running turn has the open delegation request `request-2`.
export function sessionWithDelegation(): Session {
  const recording: RequestRecording = { ...permissionRequest('request-2'), kind: 'delegation-request', text: 'split it' };
  return recordedRequest(sessionWithRunningTurn(), recording);
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

// Holds the trailing run of non-whitespace characters and releases the
// text before it through `redact`; the adapter's own tests cover shapes.
export function trailingRunRedactor(redact: (text: string) => string): SessionOutputRedactor {
  return {
    split(held, chunk) {
      const text = held.text + chunk;
      let hold = text.length;
      while (hold > 0 && !/\s/.test(text[hold - 1]!)) hold -= 1;
      return { released: redact(text.slice(0, hold)), held: { text: text.slice(hold), continuation: 'none' } };
    },
    release: (held) => redact(held.text),
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const flipped = (bytes: Uint8Array) => bytes.map((byte) => byte ^ 0x5a);

// A reversible stand-in for AES-256-GCM that opens only for its context and
// stores no plaintext byte; the secrets adapter's tests cover the cipher.
export const FLIPPING_CIPHER: OutputTailCipher = {
  seal: (text, context) => ({ nonce: Uint8Array.of(7), sealed: flipped(encoder.encode(JSON.stringify([context, text]))) }),
  open({ sealed }, context) {
    try {
      const [sealedFor, text] = JSON.parse(decoder.decode(flipped(sealed))) as [string, string];
      return sealedFor === context ? text : undefined;
    } catch {
      return undefined;
    }
  },
};
