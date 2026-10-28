import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRST_SESSION_GENERATION,
  activeBoundAttempt,
  bindAttempt,
  endBoundAttempt,
  endGeneration,
  openSession,
  parseSessionGeneration,
  runningGeneration,
  startGeneration,
  submitTurn,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import { ownership } from './fixtures.ts';
import {
  AUTHOR,
  CHILD_TASK,
  FIRST_ATTEMPT,
  HARNESS,
  NATIVE,
  OTHER_SESSION,
  SECOND_ATTEMPT,
  SESSION,
  TASK,
  binding,
  generation,
  nativeSessionId,
  newSession,
  runningSession,
  sessionWithOpenRequest,
  sessionWithRunningTurn,
  turnId,
  turnKey,
} from './session-fixtures.ts';

function generationStart(number: number) {
  return { generation: generation(number), nativeSessionId: NATIVE };
}

function endedFirstAttempt() {
  return value(endBoundAttempt(value(bindAttempt(newSession(), binding(), [])), FIRST_ATTEMPT));
}

test('a session generation is a positive safe integer, starting at 1', () => {
  assert.equal(value(parseSessionGeneration(3)), 3);
  assert.equal(FIRST_SESSION_GENERATION, 1);
  for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(failed(parseSessionGeneration(bad)).code, 'invalid');
  }
});

test('a new session belongs to its task and harness and holds nothing yet', () => {
  const session = openSession({ id: SESSION, taskId: TASK, harness: HARNESS });
  assert.equal(session.taskId, TASK);
  assert.equal(session.harness, HARNESS);
  assert.deepEqual(session.attempts, []);
  assert.deepEqual(session.turns, []);
  assert.deepEqual(session.output, { entries: [], retainedBytes: 0, lastPosition: 0 });
  assert.equal(session.limit, undefined);
  assert.ok(Object.isFrozen(session));
});

test('a session binds one attempt of its task, and a second active attempt fails', () => {
  const bound = value(bindAttempt(newSession(), binding(), []));
  assert.equal(activeBoundAttempt(bound)?.id, FIRST_ATTEMPT);
  const second = failed(bindAttempt(bound, binding(SECOND_ATTEMPT), []));
  assert.equal(second.code, 'precondition-failed');
  assert.equal(activeBoundAttempt(bound)?.id, FIRST_ATTEMPT);
});

test('after the bound attempt ended, the session binds the task attempt of its next admission', () => {
  const ended = endedFirstAttempt();
  assert.equal(activeBoundAttempt(ended), undefined);
  const rebound = value(bindAttempt(ended, binding(SECOND_ATTEMPT, ownership(2)), []));
  assert.equal(activeBoundAttempt(rebound)?.id, SECOND_ATTEMPT);
  assert.equal(activeBoundAttempt(rebound)?.ownershipGeneration, 2);
  assert.equal(rebound.attempts.length, 2);
});

test('an attempt of another task, including a delegated child task, fails with conflict', () => {
  assert.equal(failed(bindAttempt(newSession(), binding(FIRST_ATTEMPT, ownership(1), CHILD_TASK), [])).code, 'conflict');
});

test('an attempt the session already bound fails with conflict, ended or not', () => {
  const bound = value(bindAttempt(newSession(), binding(), []));
  assert.equal(failed(bindAttempt(bound, binding(), [])).code, 'conflict');
  assert.equal(failed(bindAttempt(endedFirstAttempt(), binding(), [])).code, 'conflict');
});

test('an attempt that another session of the task holds fails with conflict', () => {
  const holder = value(bindAttempt(newSession(), binding(), []));
  const other = newSession(OTHER_SESSION);
  assert.equal(failed(bindAttempt(other, binding(), [holder])).code, 'conflict');
  assert.ok(value(bindAttempt(other, binding(SECOND_ATTEMPT), [holder, other])));
});

test('ending an attempt the session never bound fails, and ending it twice changes nothing', () => {
  assert.equal(failed(endBoundAttempt(newSession(), FIRST_ATTEMPT)).code, 'not-found');
  const ended = endedFirstAttempt();
  assert.equal(value(endBoundAttempt(ended, FIRST_ATTEMPT)), ended);
});

test('the first generation is 1 under the active attempt and records the native session', () => {
  const session = runningSession();
  assert.deepEqual(runningGeneration(session), { generation: 1, attemptId: FIRST_ATTEMPT, ended: false });
  assert.equal(session.nativeSessionId, NATIVE);
});

test('a generation needs an active bound attempt', () => {
  assert.equal(failed(startGeneration(newSession(), generationStart(1))).code, 'precondition-failed');
  assert.equal(failed(startGeneration(endedFirstAttempt(), generationStart(1))).code, 'precondition-failed');
});

test('a generation starts only as the next one after the last ended', () => {
  const bound = value(bindAttempt(newSession(), binding(), []));
  assert.equal(failed(startGeneration(bound, generationStart(2))).code, 'precondition-failed');
  const running = runningSession();
  assert.equal(failed(startGeneration(running, generationStart(2))).code, 'precondition-failed');
  const ended = value(endGeneration(running, generation(1)));
  assert.equal(failed(startGeneration(ended, { generation: generation(3), nativeSessionId: NATIVE })).code, 'precondition-failed');
  const resumed = value(startGeneration(ended, generationStart(2)));
  assert.equal(runningGeneration(resumed)?.generation, 2);
});

test('a later generation must name the same native session', () => {
  const ended = value(endGeneration(runningSession(), generation(1)));
  const other = { generation: generation(2), nativeSessionId: nativeSessionId('native-2') };
  assert.equal(failed(startGeneration(ended, other)).code, 'conflict');
});

test('ending an unknown generation fails, and ending an ended one changes nothing', () => {
  const running = runningSession();
  assert.equal(failed(endGeneration(running, generation(2))).code, 'not-found');
  const ended = value(endGeneration(running, generation(1)));
  assert.equal(runningGeneration(ended), undefined);
  assert.equal(value(endGeneration(ended, generation(1))), ended);
});

test('ending the bound attempt ends and reconciles its running generation', () => {
  const ended = value(endBoundAttempt(sessionWithOpenRequest(), FIRST_ATTEMPT));
  assert.equal(runningGeneration(ended), undefined);
  assert.equal(ended.generations[0]?.ended, true);
  assert.equal(ended.requests[0]?.state, 'unresolved');
  assert.equal(ended.turns[0]?.state, 'outcome-unknown');
});

test('the same change applied twice gives equal results and leaves its input unchanged', () => {
  const session = runningSession();
  const before = structuredClone(session);
  const submission = { turnId: turnId('turn-1'), key: turnKey('key-1'), author: AUTHOR, text: 'hello' };
  assert.deepEqual(submitTurn(session, submission), submitTurn(session, submission));
  assert.deepEqual(endBoundAttempt(session, FIRST_ATTEMPT), endBoundAttempt(session, FIRST_ATTEMPT));
  assert.deepEqual(session, before);
});

test('a changed session and its records are frozen', () => {
  const session = value(endBoundAttempt(sessionWithRunningTurn(), FIRST_ATTEMPT));
  const records = [session, session.attempts, session.generations, session.turns, session.requests, session.output];
  for (const record of [...records, ...session.attempts, ...session.generations, ...session.turns]) {
    assert.ok(Object.isFrozen(record));
  }
});
