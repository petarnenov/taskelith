import { ok, type Result } from '@taskelith/kernel';
import { MAX_HARNESS_TEXT_LENGTH } from '../ports/agent-harness.js';
import type { HarnessRequestKind } from '../ports/agent-harness-data.js';
import type { SessionGeneration, TurnId } from './identifiers.js';
import {
  activeBoundAttempt,
  appended,
  isLiveTurn,
  isTextWithin,
  replaced,
  sessionFailure,
  withChanges,
  type Answer,
  type DeliveryReport,
  type NativeRequest,
  type RequestKey,
  type RequestRecording,
  type ResponseSubmission,
  type Session,
} from './session-records.js';

const ANSWER_KIND: Readonly<Record<HarnessRequestKind, Answer['kind']>> = Object.freeze({
  'permission-request': 'permission',
  'input-request': 'input',
  'delegation-request': 'delegation-result',
});

const MAX_DELEGATION_ID_LENGTH = 128;

// Records a native request before anything shows it (contract, section 5.1).
export function recordRequest(session: Session, recording: RequestRecording): Result<Session> {
  if (!isTextWithin(recording.text, 0, MAX_HARNESS_TEXT_LENGTH)) return sessionFailure('invalid', session, 'got request text out of bounds');
  const existing = session.requests.find((request) => isSameKey(request.key, recording.key));
  if (existing !== undefined) {
    return isSameRecording(existing, recording) ? ok(session) : sessionFailure('conflict', session, 'holds another request under this key');
  }
  const turn = session.turns.find((candidate) => candidate.id === recording.turnId);
  if (turn === undefined) return sessionFailure('not-found', session, `has no turn ${recording.turnId}`);
  if (!isLiveTurn(session, turn, recording.key.generation)) {
    return sessionFailure('precondition-failed', session, `does not run turn ${turn.id} in generation ${recording.key.generation}`);
  }
  return ok(withChanges(session, { requests: appended(session.requests, { ...recording, state: 'open' }) }));
}

// Consumes the first valid response to an open request (section 5.2).
export function consumeResponse(session: Session, response: ResponseSubmission): Result<Session> {
  if (!isAnswerWithinBounds(response.answer)) return sessionFailure('invalid', session, 'got an answer out of bounds');
  const index = indexOfRequest(session, response.request);
  const request = session.requests[index];
  if (request === undefined) return sessionFailure('not-found', session, 'has no such request');
  if (request.state === 'answered') return sessionFailure('conflict', session, 'already consumed a response to the request');
  if (request.state !== 'open') return sessionFailure('not-found', session, `holds the request as ${request.state}`);
  const active = activeBoundAttempt(session);
  if (active?.id !== response.attemptId || active.ownershipGeneration !== response.ownershipGeneration) {
    return sessionFailure('precondition-failed', session, `has not ${response.attemptId} as its active attempt`);
  }
  if (ANSWER_KIND[request.kind] !== response.answer.kind) return sessionFailure('invalid', session, `cannot answer a ${request.kind} so`);
  const { answer, responder, attemptId, ownershipGeneration } = response;
  const consumed = { answer, responder, attemptId, ownershipGeneration, delivery: 'pending' as const };
  return ok(withChanges(session, { requests: replaced(session.requests, index, { ...request, state: 'answered', response: consumed }) }));
}

// Records the host's single report of a response's delivery (section 5.4).
export function recordDeliveryReport(session: Session, key: RequestKey, report: DeliveryReport): Result<Session> {
  const index = indexOfRequest(session, key);
  const request = session.requests[index];
  if (request === undefined) return sessionFailure('not-found', session, 'has no such request');
  if (request.state !== 'answered' || request.response.delivery !== 'pending') {
    return sessionFailure('precondition-failed', session, 'has no response awaiting its delivery report');
  }
  const reported = { ...request, response: { ...request.response, delivery: report } };
  return ok(withChanges(session, { requests: replaced(session.requests, index, reported) }));
}

export function requestsAwaitingAnswer(session: Session): readonly NativeRequest[] {
  return Object.freeze(session.requests.filter((request) => request.state === 'open'));
}

export function uncertainDeliveries(session: Session): readonly NativeRequest[] {
  return Object.freeze(session.requests.filter(isDeliveryUncertain));
}

// What a generation's end leaves of its requests (section 6).
export function reconcileRequests(requests: readonly NativeRequest[], generation: SessionGeneration): readonly NativeRequest[] {
  return Object.freeze(requests.map((request) => (request.key.generation === generation ? reconciledRequest(request) : request)));
}

// A turn's outcome expires its requests without a response.
export function expireRequestsOf(requests: readonly NativeRequest[], turnId: TurnId): readonly NativeRequest[] {
  return Object.freeze(requests.map((request) => (
    request.turnId === turnId && request.state === 'open' ? Object.freeze({ ...request, state: 'expired' as const }) : request
  )));
}

function reconciledRequest(request: NativeRequest): NativeRequest {
  if (request.state === 'open') return Object.freeze({ ...request, state: 'unresolved' });
  if (request.state !== 'answered' || request.response.delivery !== 'pending') return request;
  const response = Object.freeze({ ...request.response, delivery: 'delivery-uncertain' as const });
  return Object.freeze({ ...request, response });
}

function isDeliveryUncertain(request: NativeRequest): boolean {
  return request.state === 'answered' && request.response.delivery === 'delivery-uncertain';
}

function isAnswerWithinBounds(answer: Answer): boolean {
  switch (answer.kind) {
    case 'permission':
      return isTextWithin(answer.message ?? '', 0, MAX_HARNESS_TEXT_LENGTH);
    case 'input':
      return isTextWithin(answer.text, 0, MAX_HARNESS_TEXT_LENGTH);
    case 'delegation-result':
      return isTextWithin(answer.delegationId, 1, MAX_DELEGATION_ID_LENGTH) && isTextWithin(answer.summary, 0, MAX_HARNESS_TEXT_LENGTH);
  }
}

function indexOfRequest(session: Session, key: RequestKey): number {
  return session.requests.findIndex((request) => isSameKey(request.key, key));
}

function isSameKey(left: RequestKey, right: RequestKey): boolean {
  return left.generation === right.generation && left.nativeRequestId === right.nativeRequestId;
}

function isSameRecording(request: NativeRequest, recording: RequestRecording): boolean {
  return request.kind === recording.kind && request.turnId === recording.turnId && request.text === recording.text;
}
