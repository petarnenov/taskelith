import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendOutput,
  deliverTurn,
  endGeneration,
  nextDeliverableTurn,
  recordRequest,
  recordTurnAcceptanceUnknown,
  recordTurnOutcome,
  recordTurnRefused,
  startGeneration,
  submitTurn,
  type Session,
  type TurnReport,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import {
  NATIVE,
  PERSON,
  generation,
  permissionRequest,
  runningSession,
  sessionWithRunningTurn,
  submitted,
  turnId,
  turnKey,
} from './session-fixtures.ts';

// Session timeline contract, sections 4.4 and 4.5: the host's reports of a
// turn whose acceptance is unknown and of a turn the plugin refused.

const report = (name: string, at = 1): TurnReport => ({ turnId: turnId(name), generation: generation(at) });

// A running session with the queued turns `a` and `b`.
function twoQueued(): Session {
  return submitted(submitted(runningSession(), 'a'), 'b');
}

function resumed(session: Session, at = 2): Session {
  const ended = value(endGeneration(session, generation(at - 1)));
  return value(startGeneration(ended, { generation: generation(at), nativeSessionId: NATIVE }));
}

test('acceptance unknown makes the earliest queued turn outcome-unknown in the reported generation', () => {
  const session = value(recordTurnAcceptanceUnknown(twoQueued(), report('a')));
  assert.deepEqual(session.turns[0], { ...session.turns[0], state: 'outcome-unknown', generation: 1 });
  assert.equal(session.turns[1]?.state, 'queued');
});

test('no turn is deliverable while the generation of an acceptance-unknown turn runs', () => {
  const session = value(recordTurnAcceptanceUnknown(twoQueued(), report('a')));
  assert.equal(nextDeliverableTurn(session), undefined);
  assert.equal(failed(deliverTurn(session, { turnId: turnId('b'), generation: generation(1) })).code, 'precondition-failed');
});

test('the next queued turn after an acceptance-unknown turn is deliverable in a later generation', () => {
  const session = resumed(value(recordTurnAcceptanceUnknown(twoQueued(), report('a'))));
  assert.equal(nextDeliverableTurn(session)?.id, 'b');
  assert.equal(session.turns[0]?.state, 'outcome-unknown');
});

test('acceptance unknown reported after its generation ended is taken, and the turn is never delivered', () => {
  const ended = value(endGeneration(twoQueued(), generation(1)));
  const session = value(recordTurnAcceptanceUnknown(ended, report('a')));
  assert.equal(session.turns[0]?.state, 'outcome-unknown');
  const next = value(startGeneration(session, { generation: generation(2), nativeSessionId: NATIVE }));
  assert.equal(nextDeliverableTurn(next)?.id, 'b');
});

test('a repeated acceptance-unknown report returns the session unchanged', () => {
  const session = value(recordTurnAcceptanceUnknown(twoQueued(), report('a')));
  assert.equal(value(recordTurnAcceptanceUnknown(session, report('a'))), session);
});

test('acceptance unknown fails with not-found for an unknown turn or generation', () => {
  assert.equal(failed(recordTurnAcceptanceUnknown(twoQueued(), report('nope'))).code, 'not-found');
  assert.equal(failed(recordTurnAcceptanceUnknown(twoQueued(), report('a', 2))).code, 'not-found');
});

test('acceptance unknown fails with conflict for a delivered, ended, or refused turn', () => {
  const running = sessionWithRunningTurn();
  assert.equal(failed(recordTurnAcceptanceUnknown(running, report('turn-1'))).code, 'conflict');
  const ended = value(recordTurnOutcome(running, { ...report('turn-1'), outcome: 'completed' }));
  assert.equal(failed(recordTurnAcceptanceUnknown(ended, report('turn-1'))).code, 'conflict');
  const refused = value(recordTurnRefused(twoQueued(), report('a')));
  assert.equal(failed(recordTurnAcceptanceUnknown(refused, report('a'))).code, 'conflict');
});

test('acceptance unknown fails with precondition-failed for a queued turn that is not the earliest', () => {
  assert.equal(failed(recordTurnAcceptanceUnknown(twoQueued(), report('b'))).code, 'precondition-failed');
});

test('a refused turn is final in its generation, and the next queued turn is deliverable at once', () => {
  const session = value(recordTurnRefused(twoQueued(), report('a')));
  assert.deepEqual(session.turns[0], { ...session.turns[0], state: 'refused', generation: 1 });
  assert.equal(nextDeliverableTurn(session)?.id, 'b');
  assert.equal(failed(deliverTurn(session, { turnId: turnId('a'), generation: generation(1) })).code, 'precondition-failed');
});

test('a persistent refusal of every queued turn leaves nothing deliverable and blocks no later turn', () => {
  const both = value(recordTurnRefused(value(recordTurnRefused(twoQueued(), report('a'))), report('b')));
  assert.equal(nextDeliverableTurn(both), undefined);
  assert.equal(nextDeliverableTurn(submitted(both, 'c'))?.id, 'c');
});

test('a refusal reported after its generation ended is taken', () => {
  const ended = value(endGeneration(twoQueued(), generation(1)));
  assert.equal(value(recordTurnRefused(ended, report('a'))).turns[0]?.state, 'refused');
});

test('a repeated refusal returns the session unchanged', () => {
  const session = value(recordTurnRefused(twoQueued(), report('a')));
  assert.equal(value(recordTurnRefused(session, report('a'))), session);
});

test('a refusal fails with not-found for an unknown turn or generation', () => {
  assert.equal(failed(recordTurnRefused(twoQueued(), report('nope'))).code, 'not-found');
  assert.equal(failed(recordTurnRefused(twoQueued(), report('a', 2))).code, 'not-found');
});

test('a refusal fails with conflict for a delivered, ended, or outcome-unknown turn', () => {
  const running = sessionWithRunningTurn();
  assert.equal(failed(recordTurnRefused(running, report('turn-1'))).code, 'conflict');
  const ended = value(recordTurnOutcome(running, { ...report('turn-1'), outcome: 'completed' }));
  assert.equal(failed(recordTurnRefused(ended, report('turn-1'))).code, 'conflict');
  const unknown = value(recordTurnAcceptanceUnknown(twoQueued(), report('a')));
  assert.equal(failed(recordTurnRefused(unknown, report('a'))).code, 'conflict');
});

test('a refusal fails with precondition-failed for a queued turn that is not the earliest', () => {
  assert.equal(failed(recordTurnRefused(twoQueued(), report('b'))).code, 'precondition-failed');
});

test('a refused turn takes no outcome, request, or output, and a retry of its key is a duplicate', () => {
  const session = value(recordTurnRefused(twoQueued(), report('a')));
  assert.equal(failed(recordTurnOutcome(session, { ...report('a'), outcome: 'completed' })).code, 'conflict');
  assert.equal(failed(recordRequest(session, permissionRequest('request-1', 'a'))).code, 'precondition-failed');
  assert.equal(failed(appendOutput(session, { ...report('a'), text: 'out' })).code, 'precondition-failed');
  const retry = value(submitTurn(session, { turnId: turnId('a-retry'), key: turnKey('key-a'), author: PERSON, text: 'text of a' }));
  assert.equal(retry.effect, 'duplicate');
  assert.equal(retry.turn.state, 'refused');
});

test('an acceptance-unknown turn takes no outcome, request, or output', () => {
  const session = value(recordTurnAcceptanceUnknown(twoQueued(), report('a')));
  assert.equal(failed(recordTurnOutcome(session, { ...report('a'), outcome: 'completed' })).code, 'conflict');
  assert.equal(failed(recordRequest(session, permissionRequest('request-1', 'a'))).code, 'precondition-failed');
  assert.equal(failed(appendOutput(session, { ...report('a'), text: 'out' })).code, 'precondition-failed');
});

test('a stopped session takes both reports', () => {
  const stopped = value(recordTurnOutcome(submitted(sessionWithRunningTurn(), 'turn-2'), {
    ...report('turn-1'), outcome: 'account-limit-reached',
  }));
  assert.equal(value(recordTurnRefused(stopped, report('turn-2'))).turns[1]?.state, 'refused');
  assert.equal(value(recordTurnAcceptanceUnknown(stopped, report('turn-2'))).turns[1]?.state, 'outcome-unknown');
});
