import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import {
  EXECUTION_STATES,
  EXECUTION_TRANSITIONS,
  classifyObservation,
  isGrantExpired,
  isTerminalExecution,
  parseExitStatus,
  parseRecoveryEpoch,
  parseSequence,
  recordAppliedSequence,
  startProducerCursor,
  type ObservationId,
  type ObservationPosition,
  type LaunchParameters,
  type ProducerCursor,
  type Sequence,
} from '@taskelith/execution';
import { OTHER_WORKER, PARAMETERS, T3, WORKER, authorized, failureOf, grantIssue, value } from './fixtures.ts';

const JOURNAL = value(parseIdentifier('JournalId', 'journal-1'));
const NEW_JOURNAL = value(parseIdentifier('JournalId', 'journal-2'));
const observationId = (text: string): ObservationId => value(parseIdentifier('ObservationId', text));

const sequence = (number: number): Sequence => value(parseSequence(number));

function position(number: number, id = `observation-${number}`, journalId = JOURNAL): ObservationPosition {
  return { workerId: WORKER, journalId, sequence: sequence(number), observationId: observationId(id) };
}

function applied(...numbers: number[]): ProducerCursor {
  return numbers.reduce((cursor, number) => value(recordAppliedSequence(cursor, sequence(number))), startProducerCursor(WORKER, JOURNAL));
}

test('the execution transition table allows exactly the transitions of the launch contract', () => {
  assert.deepEqual(Object.keys(EXECUTION_TRANSITIONS), [...EXECUTION_STATES]);
  assert.deepEqual(EXECUTION_TRANSITIONS.authorized, ['started', 'exited', 'not-started']);
  assert.deepEqual(EXECUTION_TRANSITIONS.started, ['exited']);
  assert.deepEqual(EXECUTION_TRANSITIONS.exited, []);
  assert.deepEqual(EXECUTION_TRANSITIONS['not-started'], []);
  assert.equal(isTerminalExecution(authorized().task.attempts[0]!.executions[0]!), false);
});

test('only parsed launch parameters are launch parameters, and a spread copy is not', () => {
  // @ts-expect-error a spread copy with replaced values is not parsed
  const spread: LaunchParameters = { ...PARAMETERS, ttlMilliseconds: Number.POSITIVE_INFINITY, skewMilliseconds: -1 };
  assert.equal(spread.ttlMilliseconds, Number.POSITIVE_INFINITY);
  assert.ok(Object.isFrozen(PARAMETERS));
  assert.throws(() => {
    (PARAMETERS as { ttlMilliseconds: number }).ttlMilliseconds = 3_600_000;
  }, TypeError);
  const { grant } = authorized(undefined, {}, grantIssue());
  assert.equal(grant.parameters, PARAMETERS);
  assert.equal(isGrantExpired(grant, T3), true);
});

test('exit statuses are a code, a signal name, or unknown', () => {
  assert.deepEqual(value(parseExitStatus({ kind: 'code', code: 3 })), { kind: 'code', code: 3 });
  assert.deepEqual(value(parseExitStatus({ kind: 'signal', signal: 'SIGKILL' })), { kind: 'signal', signal: 'SIGKILL' });
  assert.deepEqual(value(parseExitStatus({ kind: 'unknown' })), { kind: 'unknown' });
  for (const input of [{ kind: 'code', code: 256 }, { kind: 'code' }, { kind: 'signal', signal: 'kill' }, { kind: 'lost' }]) {
    assert.equal(failureOf(parseExitStatus(input)).code, 'invalid');
  }
});

test('recovery epochs and sequences are positive integers', () => {
  assert.equal(value(parseRecoveryEpoch(2)), 2);
  assert.equal(failureOf(parseRecoveryEpoch(0)).code, 'invalid');
  assert.equal(value(parseSequence(1)), 1);
  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(failureOf(parseSequence(invalid)).code, 'invalid');
  }
});

test('the contiguous prefix is confirmed, and a gap holds later sequences until it closes', () => {
  const gapped = applied(1, 2, 4, 5);
  assert.equal(gapped.confirmedThrough, 2);
  assert.deepEqual(gapped.appliedAbove, [4, 5]);
  const closed = value(recordAppliedSequence(gapped, sequence(3)));
  assert.equal(closed.confirmedThrough, 5);
  assert.deepEqual(closed.appliedAbove, []);
  assert.equal(failureOf(recordAppliedSequence(closed, sequence(4))).code, 'conflict');
});

test('a repeated publication is a duplicate, and a reused sequence with another identity is a rollback', () => {
  const cursor = applied(1, 2, 4);
  assert.equal(value(classifyObservation(cursor, position(3))), 'new');
  assert.equal(value(classifyObservation(cursor, position(2), observationId('observation-2'))), 'duplicate');
  assert.equal(value(classifyObservation(cursor, position(4), observationId('observation-4'))), 'duplicate');
  assert.equal(value(classifyObservation(cursor, position(2, 'observation-x'), observationId('observation-2'))), 'rollback');
  assert.equal(value(classifyObservation(cursor, position(1, 'observation-1', NEW_JOURNAL))), 'new-incarnation');
});

test('an observation of another worker is not classified in this worker\'s cursor', () => {
  const foreign = { ...position(1), workerId: OTHER_WORKER };
  assert.equal(failureOf(classifyObservation(applied(), foreign)).code, 'forbidden');
});
