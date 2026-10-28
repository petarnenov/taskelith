import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import {
  DELIVERY_STATES,
  MAX_HARNESS_TEXT_LENGTH,
  REQUEST_STATES,
  bindAttempt,
  consumeResponse,
  endBoundAttempt,
  endGeneration,
  recordDeliveryReport,
  recordRequest,
  recordTurnOutcome,
  requestsAwaitingAnswer,
  startGeneration,
  uncertainDeliveries,
  type RequestRecording,
  type Responder,
  type ResponseSubmission,
  type Session,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import { ownership } from './fixtures.ts';
import {
  FIRST_ATTEMPT,
  NATIVE,
  SECOND_ATTEMPT,
  allow,
  binding,
  delivered,
  generation,
  permissionRequest,
  requestKey,
  sessionWithOpenRequest,
  sessionWithRunningTurn,
  submitted,
  turnId,
} from './session-fixtures.ts';

const RULE = value(parseIdentifier('StandingRuleId', 'rule-1'));
const HOST: Responder = { kind: 'host' };
const LONGEST_TEXT = 'x'.repeat(MAX_HARNESS_TEXT_LENGTH);

function answered(): Session {
  return value(consumeResponse(sessionWithOpenRequest(), allow()));
}

function request(session: Session, recording: RequestRecording): Session {
  return value(recordRequest(session, recording));
}

function inputRequest(native: string): RequestRecording {
  return { key: requestKey(native), kind: 'input-request', turnId: turnId('turn-1'), text: 'which branch?' };
}

function sessionWithDelegation(): Session {
  const recording: RequestRecording = { ...permissionRequest('request-2'), kind: 'delegation-request', text: 'split it' };
  return request(sessionWithRunningTurn(), recording);
}

function delegationResult(delegationId = 'child-1', summary = 'done'): ResponseSubmission {
  const answer = { kind: 'delegation-result' as const, delegationId, outcome: 'completed' as const, summary };
  return { ...allow('request-2'), answer, responder: HOST };
}

function resumed(session: Session): Session {
  const ended = value(endGeneration(session, generation(1)));
  return delivered(value(startGeneration(ended, { generation: generation(2), nativeSessionId: NATIVE })), 'turn-2', 2);
}

test('the request and delivery states are those of the contract', () => {
  assert.deepEqual(REQUEST_STATES, ['open', 'answered', 'expired', 'unresolved']);
  assert.deepEqual(DELIVERY_STATES, ['pending', 'delivered', 'refused', 'delivery-uncertain']);
});

test('a recorded request is open and awaits its answer; an unrecorded one is not listed', () => {
  const running = sessionWithRunningTurn();
  assert.deepEqual(requestsAwaitingAnswer(running), []);
  const session = sessionWithOpenRequest();
  assert.deepEqual(requestsAwaitingAnswer(session), [{ ...permissionRequest('request-1'), state: 'open' }]);
});

test('recording a request twice with the same content holds it once; other content conflicts', () => {
  const session = sessionWithOpenRequest();
  assert.equal(value(recordRequest(session, permissionRequest('request-1'))), session);
  const changed = { ...permissionRequest('request-1'), text: 'something else' };
  assert.equal(failed(recordRequest(session, changed)).code, 'conflict');
});

test('a request needs a delivered turn of the running generation and text within its bound', () => {
  const running = sessionWithRunningTurn();
  assert.equal(failed(recordRequest(running, permissionRequest('r', 'nope'))).code, 'not-found');
  assert.equal(failed(recordRequest(running, permissionRequest('r', 'turn-1', 2))).code, 'precondition-failed');
  const long = { ...permissionRequest('r'), text: 'x'.repeat(MAX_HARNESS_TEXT_LENGTH + 1) };
  assert.equal(failed(recordRequest(running, long)).code, 'invalid');
});

test('a request for a queued turn of the running generation fails with precondition-failed', () => {
  const queued = submitted(sessionWithRunningTurn(), 'turn-2');
  assert.equal(failed(recordRequest(queued, permissionRequest('r', 'turn-2'))).code, 'precondition-failed');
});

test('a request for an ended turn of the running generation fails with precondition-failed', () => {
  const end = { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' as const };
  const ended = value(recordTurnOutcome(sessionWithRunningTurn(), end));
  assert.equal(failed(recordRequest(ended, permissionRequest('r'))).code, 'precondition-failed');
});

test('the first valid response is consumed with its responder and attempt, pending delivery', () => {
  const session = answered();
  assert.deepEqual(session.requests[0], {
    ...permissionRequest('request-1'),
    state: 'answered',
    response: {
      answer: allow().answer,
      responder: allow().responder,
      attemptId: FIRST_ATTEMPT,
      ownershipGeneration: ownership(1),
      delivery: 'pending',
    },
  });
  assert.deepEqual(requestsAwaitingAnswer(session), []);
});

test('a duplicate response fails with conflict, and the first response stays', () => {
  const session = answered();
  const deny: ResponseSubmission = { ...allow(), answer: { kind: 'permission', decision: 'deny' } };
  assert.equal(failed(consumeResponse(session, deny)).code, 'conflict');
});

test('a standing rule may be the responder', () => {
  const byRule = { ...allow(), responder: { kind: 'standing-rule' as const, ruleId: RULE } };
  const session = value(consumeResponse(sessionWithOpenRequest(), byRule));
  assert.equal(session.requests[0]?.state, 'answered');
});

test('a standing rule answers only a permission request', () => {
  const byRule: Responder = { kind: 'standing-rule', ruleId: RULE };
  const session = request(sessionWithRunningTurn(), inputRequest('request-2'));
  const input: ResponseSubmission = { ...allow('request-2'), answer: { kind: 'input', text: 'main' }, responder: byRule };
  assert.equal(failed(consumeResponse(session, input)).code, 'invalid');
  assert.equal(failed(consumeResponse(sessionWithDelegation(), { ...delegationResult(), responder: byRule })).code, 'invalid');
});

test('an unknown request fails with not-found', () => {
  assert.equal(failed(consumeResponse(sessionWithOpenRequest(), allow('nope'))).code, 'not-found');
});

test('a response for a replaced attempt or ownership generation fails with precondition-failed', () => {
  const session = sessionWithOpenRequest();
  assert.equal(failed(consumeResponse(session, { ...allow(), attemptId: SECOND_ATTEMPT })).code, 'precondition-failed');
  assert.equal(failed(consumeResponse(session, { ...allow(), ownershipGeneration: ownership(2) })).code, 'precondition-failed');
});

test('an answer of the wrong kind fails with invalid', () => {
  const session = sessionWithOpenRequest();
  const input: ResponseSubmission = { ...allow(), answer: { kind: 'input', text: 'main' } };
  assert.equal(failed(consumeResponse(session, input)).code, 'invalid');
  const withInput = request(session, inputRequest('request-2'));
  assert.equal(failed(consumeResponse(withInput, { ...allow('request-2') })).code, 'invalid');
  const answer = value(consumeResponse(withInput, { ...input, request: requestKey('request-2') }));
  assert.equal(answer.requests[1]?.state, 'answered');
});

test('a permission message is at most 65,536 characters', () => {
  const deny = (message: string): ResponseSubmission => ({ ...allow(), answer: { kind: 'permission', decision: 'deny', message } });
  assert.equal(failed(consumeResponse(sessionWithOpenRequest(), deny(LONGEST_TEXT + 'x'))).code, 'invalid');
  assert.ok(value(consumeResponse(sessionWithOpenRequest(), deny(LONGEST_TEXT))));
});

test('an input answer text is at most 65,536 characters', () => {
  const session = request(sessionWithRunningTurn(), inputRequest('request-2'));
  const input = (text: string): ResponseSubmission => ({ ...allow('request-2'), answer: { kind: 'input', text } });
  assert.equal(failed(consumeResponse(session, input(LONGEST_TEXT + 'x'))).code, 'invalid');
  assert.ok(value(consumeResponse(session, input(LONGEST_TEXT))));
});

test('a delegation summary is at most 65,536 characters', () => {
  const session = sessionWithDelegation();
  assert.equal(failed(consumeResponse(session, delegationResult('child-1', LONGEST_TEXT + 'x'))).code, 'invalid');
  assert.ok(value(consumeResponse(session, delegationResult('child-1', LONGEST_TEXT))));
});

test('a delegation ID is 1 to 128 characters', () => {
  const session = sessionWithDelegation();
  assert.equal(failed(consumeResponse(session, delegationResult(''))).code, 'invalid');
  assert.equal(failed(consumeResponse(session, delegationResult('d'.repeat(129)))).code, 'invalid');
  assert.ok(value(consumeResponse(session, delegationResult('d'))));
  assert.ok(value(consumeResponse(session, delegationResult('d'.repeat(128)))));
});

test('a delegation request takes a delegation result from the host', () => {
  const result = value(consumeResponse(sessionWithDelegation(), delegationResult()));
  const consumed = result.requests[0];
  assert.equal(consumed?.state === 'answered' && consumed.response.responder.kind, 'host');
});

test('only the host returns a delegation result, and the host answers nothing else', () => {
  const byPerson = { ...delegationResult(), responder: allow().responder };
  assert.equal(failed(consumeResponse(sessionWithDelegation(), byPerson)).code, 'invalid');
  const hostAllows = { ...allow(), responder: HOST };
  assert.equal(failed(consumeResponse(sessionWithOpenRequest(), hostAllows)).code, 'invalid');
});

test('a reused native request ID in a later generation is a new open request', () => {
  const later = request(resumed(answered()), permissionRequest('request-1', 'turn-2', 2));
  assert.equal(later.requests[1]?.state, 'open');
  assert.equal('response' in (later.requests[1] ?? {}), false);
  assert.equal(failed(consumeResponse(later, allow('request-1', 1))).code, 'conflict');
  assert.equal(later.requests[1]?.state, 'open');
  assert.equal(value(consumeResponse(later, allow('request-1', 2))).requests[1]?.state, 'answered');
});

test('a delivery report is recorded once, and a second fails with precondition-failed', () => {
  for (const report of ['delivered', 'refused', 'delivery-uncertain'] as const) {
    const session = value(recordDeliveryReport(answered(), requestKey('request-1'), report));
    assert.equal(session.requests[0]?.state === 'answered' && session.requests[0].response.delivery, report);
    assert.equal(failed(recordDeliveryReport(session, requestKey('request-1'), 'delivered')).code, 'precondition-failed');
  }
});

test('a delivery report needs a known answered request', () => {
  assert.equal(failed(recordDeliveryReport(answered(), requestKey('nope'), 'delivered')).code, 'not-found');
  const open = sessionWithOpenRequest();
  assert.equal(failed(recordDeliveryReport(open, requestKey('request-1'), 'delivered')).code, 'precondition-failed');
});

test('a timed-out delivery is uncertain and is listed for acknowledgement', () => {
  const session = value(recordDeliveryReport(answered(), requestKey('request-1'), 'delivery-uncertain'));
  assert.deepEqual(uncertainDeliveries(session).map((item) => item.key), [requestKey('request-1')]);
});

test('a restart during a pending approval leaves the request unresolved and never answered', () => {
  const ended = value(endGeneration(sessionWithOpenRequest(), generation(1)));
  assert.equal(ended.requests[0]?.state, 'unresolved');
  assert.deepEqual(requestsAwaitingAnswer(ended), []);
  assert.equal(failed(consumeResponse(ended, allow())).code, 'not-found');
  const next = value(startGeneration(ended, { generation: generation(2), nativeSessionId: NATIVE }));
  assert.deepEqual(requestsAwaitingAnswer(next), []);
});

test('a consumed response without a delivery report becomes delivery-uncertain at the generation end', () => {
  const ended = value(endGeneration(answered(), generation(1)));
  assert.deepEqual(uncertainDeliveries(ended).map((item) => item.key), [requestKey('request-1')]);
  assert.equal(failed(recordDeliveryReport(ended, requestKey('request-1'), 'delivered')).code, 'precondition-failed');
});

test('a reported delivery stays as reported at the generation end', () => {
  const reported = value(recordDeliveryReport(answered(), requestKey('request-1'), 'delivered'));
  const ended = value(endGeneration(reported, generation(1)));
  assert.deepEqual(uncertainDeliveries(ended), []);
});

test('a response after the bound attempt ended fails', () => {
  const ended = value(endBoundAttempt(sessionWithOpenRequest(), FIRST_ATTEMPT));
  const rebound = value(bindAttempt(ended, binding(SECOND_ATTEMPT, ownership(2)), []));
  const response = { ...allow(), attemptId: SECOND_ATTEMPT, ownershipGeneration: ownership(2) };
  assert.equal(failed(consumeResponse(rebound, response)).code, 'not-found');
});
