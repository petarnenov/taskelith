import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import {
  MAX_HARNESS_TEXT_LENGTH,
  TURN_STATES,
  consumeResponse,
  deliverTurn,
  endGeneration,
  isStopped,
  nextDeliverableTurn,
  recordTurnOutcome,
  startGeneration,
  submitTurn,
  type RequestKey,
  type Session,
  type TurnAuthor,
  type TurnEnd,
  type TurnSubmission,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import {
  NATIVE,
  PERSON,
  allow,
  permissionRequest,
  recordedRequest,
  requestKey,
  sessionWithDelegation,
  generation,
  runningSession,
  sessionWithOpenRequest,
  sessionWithRunningTurn,
  submitted,
  turnId,
  turnKey,
} from './session-fixtures.ts';

const OTHER_PERSON: TurnAuthor = { kind: 'principal', principalId: value(parseIdentifier('PrincipalId', 'person-2')) };

function submission(name: string, text = `text of ${name}`) {
  return { turnId: turnId(name), key: turnKey(`key-${name}`), author: PERSON, text };
}

// The host's turn that delivers a delegated child's outcome (port, 7.4).
function outcomeTurn(request: RequestKey = requestKey('request-2')): TurnSubmission {
  const author: TurnAuthor = { kind: 'host', delegationRequest: request };
  return { turnId: turnId('delegation-child-1'), key: turnKey('delegation-child-1'), author, text: 'child-1 completed' };
}

function resumedAfter(session: Session): Session {
  const ended = value(endGeneration(session, generation(1)));
  return value(startGeneration(ended, { generation: generation(2), nativeSessionId: NATIVE }));
}

function end(name: string, outcome: TurnEnd['outcome'] = 'completed', at = 1): TurnEnd {
  return { turnId: turnId(name), generation: generation(at), outcome };
}

function completed(session: Session, name: string): Session {
  return value(recordTurnOutcome(session, end(name)));
}

test('the turn states are those of the contract', () => {
  assert.deepEqual(TURN_STATES, ['queued', 'delivered', 'ended', 'outcome-unknown']);
});

test('a submitted turn keeps the caller-supplied identity, author, and text, and is queued', () => {
  const result = value(submitTurn(runningSession(), submission('turn-1', 'hello')));
  assert.equal(result.effect, 'recorded');
  assert.deepEqual(result.turn, {
    id: turnId('turn-1'), key: turnKey('key-turn-1'), author: PERSON, text: 'hello', position: 1, state: 'queued',
  });
  assert.deepEqual(result.session.turns, [result.turn]);
});

test('three turns take positions 1, 2, and 3 in submission order', () => {
  const session = submitted(submitted(submitted(runningSession(), 'a'), 'b'), 'c');
  assert.deepEqual(session.turns.map((turn) => [turn.id, turn.position]), [['a', 1], ['b', 2], ['c', 3]]);
});

test('a retried submission returns the existing turn, and the timeline has no new turn', () => {
  const session = submitted(runningSession(), 'turn-1');
  const retry = value(submitTurn(session, { ...submission('turn-1'), turnId: turnId('turn-retry') }));
  assert.equal(retry.effect, 'duplicate');
  assert.equal(retry.session, session);
  assert.equal(retry.turn.id, 'turn-1');
});

test('a key reused with other text fails with conflict', () => {
  const session = submitted(runningSession(), 'turn-1');
  const reused = { ...submission('turn-1', 'other text'), turnId: turnId('turn-2') };
  assert.equal(failed(submitTurn(session, reused)).code, 'conflict');
});

test('a key reused by another author fails with conflict', () => {
  const session = submitted(runningSession(), 'turn-1');
  const byOther = { ...submission('turn-1'), turnId: turnId('turn-2'), author: OTHER_PERSON };
  assert.equal(failed(submitTurn(session, byOther)).code, 'conflict');
});

test('a turn ID already in the timeline fails with conflict', () => {
  const session = submitted(runningSession(), 'turn-1');
  const repeated = { ...submission('turn-2'), turnId: turnId('turn-1') };
  assert.equal(failed(submitTurn(session, repeated)).code, 'conflict');
});

test('turn text outside its bound fails with invalid', () => {
  const session = runningSession();
  assert.equal(failed(submitTurn(session, submission('turn-1', ''))).code, 'invalid');
  const long = 'x'.repeat(MAX_HARNESS_TEXT_LENGTH + 1);
  assert.equal(failed(submitTurn(session, submission('turn-1', long))).code, 'invalid');
  assert.ok(value(submitTurn(session, submission('turn-1', 'x'.repeat(MAX_HARNESS_TEXT_LENGTH)))));
});

test('a submission during a running turn is queued and becomes deliverable after its outcome', () => {
  const session = submitted(sessionWithRunningTurn(), 'turn-2');
  assert.equal(session.turns[1]?.state, 'queued');
  assert.equal(nextDeliverableTurn(session), undefined);
  assert.equal(nextDeliverableTurn(completed(session, 'turn-1'))?.id, 'turn-2');
});

test('a delivered turn records its generation', () => {
  const session = sessionWithRunningTurn();
  assert.deepEqual(session.turns[0], { ...session.turns[0], state: 'delivered', generation: 1 });
});

test('delivering a second turn while one runs fails with precondition-failed', () => {
  const session = submitted(sessionWithRunningTurn(), 'turn-2');
  const second = { turnId: turnId('turn-2'), generation: generation(1) };
  assert.equal(failed(deliverTurn(session, second)).code, 'precondition-failed');
});

test('queued turns are delivered in their order', () => {
  const session = submitted(submitted(runningSession(), 'a'), 'b');
  assert.equal(nextDeliverableTurn(session)?.id, 'a');
  assert.equal(failed(deliverTurn(session, { turnId: turnId('b'), generation: generation(1) })).code, 'precondition-failed');
});

test('a delivery needs a known queued turn and the running generation', () => {
  const queued = submitted(runningSession(), 'turn-1');
  assert.equal(failed(deliverTurn(queued, { turnId: turnId('nope'), generation: generation(1) })).code, 'not-found');
  assert.equal(failed(deliverTurn(queued, { turnId: turnId('turn-1'), generation: generation(2) })).code, 'precondition-failed');
  const ended = value(endGeneration(queued, generation(1)));
  assert.equal(nextDeliverableTurn(ended), undefined);
  assert.equal(failed(deliverTurn(ended, { turnId: turnId('turn-1'), generation: generation(1) })).code, 'precondition-failed');
  const running = sessionWithRunningTurn();
  assert.equal(failed(deliverTurn(running, { turnId: turnId('turn-1'), generation: generation(1) })).code, 'precondition-failed');
});

test('a turn records one outcome; a second fails with conflict, and the first stays', () => {
  const session = completed(sessionWithRunningTurn(), 'turn-1');
  assert.deepEqual(session.turns[0], { ...session.turns[0], state: 'ended', generation: 1, outcome: 'completed' });
  assert.equal(failed(recordTurnOutcome(session, end('turn-1', 'interrupted'))).code, 'conflict');
});

test('a failure comes exactly with a failed outcome', () => {
  const session = sessionWithRunningTurn();
  assert.equal(failed(recordTurnOutcome(session, end('turn-1', 'failed'))).code, 'invalid');
  const extra = { ...end('turn-1'), failure: 'transport' as const };
  assert.equal(failed(recordTurnOutcome(session, extra)).code, 'invalid');
  const failure = value(recordTurnOutcome(session, { ...end('turn-1', 'failed'), failure: 'harness-exited' }));
  assert.deepEqual(failure.turns[0], { ...failure.turns[0], outcome: 'failed', failure: 'harness-exited' });
});

test('an outcome needs a known delivered turn of its generation', () => {
  const session = submitted(sessionWithRunningTurn(), 'turn-2');
  assert.equal(failed(recordTurnOutcome(session, end('nope'))).code, 'not-found');
  assert.equal(failed(recordTurnOutcome(session, end('turn-2'))).code, 'precondition-failed');
  assert.equal(failed(recordTurnOutcome(session, end('turn-1', 'completed', 2))).code, 'precondition-failed');
});

test('an outcome expires the turn requests without a response', () => {
  const session = completed(sessionWithOpenRequest(), 'turn-1');
  assert.equal(session.requests[0]?.state, 'expired');
  assert.equal(failed(consumeResponse(session, allow())).code, 'not-found');
});

test('a turn without an outcome at its generation end is outcome-unknown, final, and never redelivered', () => {
  const ended = value(endGeneration(sessionWithRunningTurn(), generation(1)));
  assert.equal(ended.turns[0]?.state, 'outcome-unknown');
  assert.equal(failed(recordTurnOutcome(ended, end('turn-1'))).code, 'conflict');
  const retry = value(submitTurn(ended, submission('turn-1')));
  assert.equal(retry.effect, 'duplicate');
  assert.equal(retry.turn.state, 'outcome-unknown');
  const resumed = value(startGeneration(ended, { generation: generation(2), nativeSessionId: NATIVE }));
  assert.equal(nextDeliverableTurn(resumed), undefined);
  assert.equal(failed(deliverTurn(resumed, { turnId: turnId('turn-1'), generation: generation(2) })).code, 'precondition-failed');
});

test('queued turns stay queued across a generation end and are delivered in the next one', () => {
  const ended = value(endGeneration(submitted(sessionWithRunningTurn(), 'turn-2'), generation(1)));
  const resumed = value(startGeneration(ended, { generation: generation(2), nativeSessionId: NATIVE }));
  assert.equal(nextDeliverableTurn(resumed)?.id, 'turn-2');
  const next = value(deliverTurn(resumed, { turnId: turnId('turn-2'), generation: generation(2) }));
  assert.deepEqual(next.turns[1], { ...next.turns[1], state: 'delivered', generation: 2 });
});

test('an account-limit-reached outcome stops the session, and a new turn fails', () => {
  const stopped = value(recordTurnOutcome(sessionWithRunningTurn(), end('turn-1', 'account-limit-reached')));
  assert.ok(isStopped(stopped));
  assert.equal(failed(submitTurn(stopped, submission('turn-2'))).code, 'precondition-failed');
  assert.equal(value(submitTurn(stopped, submission('turn-1'))).effect, 'duplicate');
});

test('the host delivers the outcome of an unresolved delegation request as a turn', () => {
  const resumed = resumedAfter(sessionWithDelegation());
  const result = value(submitTurn(resumed, outcomeTurn()));
  assert.equal(result.effect, 'recorded');
  assert.deepEqual(result.turn.author, { kind: 'host', delegationRequest: requestKey('request-2') });
  assert.equal(nextDeliverableTurn(result.session)?.id, 'delegation-child-1');
});

test('the host delivers the outcome of an expired delegation request as a turn', () => {
  const expired = completed(sessionWithDelegation(), 'turn-1');
  assert.equal(value(submitTurn(expired, outcomeTurn())).effect, 'recorded');
});

test('a host turn needs a delegation request that can no longer be answered', () => {
  const resumed = resumedAfter(recordedRequest(sessionWithDelegation(), permissionRequest('request-1')));
  assert.equal(failed(submitTurn(resumed, outcomeTurn(requestKey('nope')))).code, 'not-found');
  assert.equal(failed(submitTurn(resumed, outcomeTurn(requestKey('request-1')))).code, 'invalid');
  assert.equal(failed(submitTurn(sessionWithDelegation(), outcomeTurn())).code, 'precondition-failed');
});

test('a retried host turn is a duplicate, and its key from a person fails with conflict', () => {
  const session = value(submitTurn(resumedAfter(sessionWithDelegation()), outcomeTurn())).session;
  assert.equal(value(submitTurn(session, outcomeTurn())).effect, 'duplicate');
  assert.equal(failed(submitTurn(session, { ...outcomeTurn(), author: PERSON })).code, 'conflict');
  const otherRequest = { ...outcomeTurn(), author: { kind: 'host' as const, delegationRequest: requestKey('request-3') } };
  assert.equal(failed(submitTurn(session, otherRequest)).code, 'conflict');
});
