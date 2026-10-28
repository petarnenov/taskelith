import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeResponse,
  deliverTurn,
  endGeneration,
  isStopped,
  recordLimitSignal,
  recordRequest,
  recordTurnOutcome,
  startGeneration,
  takeHandoff,
  writeHandoff,
  type Session,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import { evidence, instant } from './fixtures.ts';
import {
  HARNESS,
  NATIVE,
  OTHER_SESSION,
  SESSION,
  TASK,
  allow,
  generation,
  newSession,
  permissionRequest,
  requestKey,
  runningSession,
  sessionId,
  sessionWithRunningTurn,
  submitted,
  taskId,
  turnId,
} from './session-fixtures.ts';

const RESET = instant('2026-10-28T12:00:00.000Z');
const SNAPSHOT = evidence('timeline-snapshot-1');
const TURN_1_END = { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' as const };

function delivered(session: Session, name: string): Session {
  return value(deliverTurn(submitted(session, name), { turnId: turnId(name), generation: generation(1) }));
}

// turn-1 completed, turn-2 runs with an open request when the limit comes.
function limitedAndEnded(): Session {
  const completed = value(recordTurnOutcome(sessionWithRunningTurn(), TURN_1_END));
  const running = value(recordRequest(delivered(completed, 'turn-2'), permissionRequest('request-2', 'turn-2')));
  const stopped = recordLimitSignal(running, { resetsAt: RESET });
  return value(endGeneration(stopped, generation(1)));
}

function withHandoff(): Session {
  return value(writeHandoff(limitedAndEnded(), SNAPSHOT));
}

test('a limit signal stops the session, which accepts no new turn, delivery, or generation', () => {
  const queued = submitted(sessionWithRunningTurn(), 'turn-2');
  const stopped = recordLimitSignal(queued, {});
  assert.ok(isStopped(stopped));
  assert.equal(isStopped(queued), false);
  assert.deepEqual(stopped.limit, {});
  const next = { turnId: turnId('turn-2'), generation: generation(1) };
  const done = value(recordTurnOutcome(stopped, TURN_1_END));
  assert.equal(failed(deliverTurn(done, next)).code, 'precondition-failed');
  const ended = value(endGeneration(done, generation(1)));
  assert.equal(failed(startGeneration(ended, { generation: generation(2), nativeSessionId: NATIVE })).code, 'precondition-failed');
});

test('a running turn of a stopped session still records its requests, responses, and outcome', () => {
  const stopped = recordLimitSignal(sessionWithRunningTurn(), {});
  const asked = value(recordRequest(stopped, permissionRequest('request-1')));
  const answered = value(consumeResponse(asked, allow()));
  assert.equal(answered.requests[0]?.state, 'answered');
  assert.equal(value(recordTurnOutcome(answered, TURN_1_END)).turns[0]?.state, 'ended');
});

test('a later limit signal records a reset time the stop lacks, and otherwise changes nothing', () => {
  const stopped = recordLimitSignal(runningSession(), {});
  const timed = recordLimitSignal(stopped, { resetsAt: RESET });
  assert.deepEqual(timed.limit, { resetsAt: RESET });
  assert.equal(recordLimitSignal(timed, { resetsAt: instant('2026-10-28T13:00:00.000Z') }), timed);
  assert.equal(recordLimitSignal(timed, {}), timed);
});

test('the handoff holds the session, task, harness, reset time, last turn with an outcome, unresolved requests, and evidence', () => {
  assert.deepEqual(withHandoff().handoff, {
    sessionId: SESSION,
    taskId: TASK,
    harness: HARNESS,
    resetsAt: RESET,
    lastTurnWithOutcome: turnId('turn-1'),
    unresolvedRequests: [requestKey('request-2')],
    evidence: SNAPSHOT,
  });
});

test('a handoff after an account-limit-reached outcome names that turn and no reset time', () => {
  const limit = { ...TURN_1_END, outcome: 'account-limit-reached' as const };
  const stopped = value(endGeneration(value(recordTurnOutcome(sessionWithRunningTurn(), limit)), generation(1)));
  const handoff = value(writeHandoff(stopped, SNAPSHOT)).handoff;
  assert.equal(handoff?.lastTurnWithOutcome, 'turn-1');
  assert.equal(handoff !== undefined && 'resetsAt' in handoff, false);
  assert.deepEqual(handoff?.unresolvedRequests, []);
});

test('a handoff is written once, only after the stop and the end of the generation', () => {
  assert.equal(failed(writeHandoff(runningSession(), SNAPSHOT)).code, 'precondition-failed');
  assert.equal(failed(writeHandoff(recordLimitSignal(runningSession(), {}), SNAPSHOT)).code, 'precondition-failed');
  assert.equal(failed(writeHandoff(withHandoff(), SNAPSHOT)).code, 'conflict');
});

test('a next session of the task takes the handoff once', () => {
  const taken = value(takeHandoff(withHandoff(), newSession(OTHER_SESSION)));
  assert.equal(taken.handoff?.takenBy, OTHER_SESSION);
  assert.equal(failed(takeHandoff(taken, newSession(sessionId('session-3')))).code, 'conflict');
});

test('a handoff is not taken by a session of another task or by its own session, nor from a session without one', () => {
  const stopped = withHandoff();
  assert.equal(failed(takeHandoff(stopped, newSession(OTHER_SESSION, taskId('task-2')))).code, 'conflict');
  assert.equal(failed(takeHandoff(stopped, stopped)).code, 'conflict');
  assert.equal(failed(takeHandoff(limitedAndEnded(), newSession(OTHER_SESSION))).code, 'not-found');
});
