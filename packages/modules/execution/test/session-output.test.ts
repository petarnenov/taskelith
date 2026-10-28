import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_HARNESS_TEXT_LENGTH,
  OUTPUT_RETENTION_BYTES,
  appendOutput,
  endGeneration,
  readOutputAfter,
  recordTurnOutcome,
  type Session,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import { generation, sessionWithRunningTurn, submitted, turnId } from './session-fixtures.ts';

const CHUNK = 'x'.repeat(MAX_HARNESS_TEXT_LENGTH);
const CHUNKS_IN_WINDOW = OUTPUT_RETENTION_BYTES / MAX_HARNESS_TEXT_LENGTH;

function appended(session: Session, ...texts: readonly string[]): Session {
  return texts.reduce(
    (current, text) => value(appendOutput(current, { turnId: turnId('turn-1'), generation: generation(1), text })),
    session,
  );
}

function chunks(count: number): Session {
  return appended(sessionWithRunningTurn(), ...Array.from({ length: count }, () => CHUNK));
}

test('the retention bound is 10 MiB of UTF-8 text', () => {
  assert.equal(OUTPUT_RETENTION_BYTES, 10_485_760);
});

test('output takes session-wide positions from 1 without gaps, tied to its turn and generation', () => {
  const session = appended(sessionWithRunningTurn(), 'a', 'b', 'c');
  assert.deepEqual(session.output.entries, [
    { turnId: 'turn-1', generation: 1, text: 'a', position: 1 },
    { turnId: 'turn-1', generation: 1, text: 'b', position: 2 },
    { turnId: 'turn-1', generation: 1, text: 'c', position: 3 },
  ]);
  assert.equal(session.output.lastPosition, 3);
  assert.equal(session.output.retainedBytes, 3);
});

test('a reader after a retained position receives the retained entries after it, in order', () => {
  const session = appended(sessionWithRunningTurn(), 'a', 'b', 'c');
  const read = value(readOutputAfter(session, 1));
  assert.deepEqual(read.kind === 'entries' && read.entries.map((entry) => entry.text), ['b', 'c']);
  assert.deepEqual(value(readOutputAfter(session, 0)), { kind: 'entries', entries: session.output.entries });
  assert.deepEqual(value(readOutputAfter(session, 3)), { kind: 'entries', entries: [] });
});

test('retained bytes count UTF-8, not characters', () => {
  const session = appended(sessionWithRunningTurn(), 'é', '€', '😀', '\ud800');
  assert.equal(session.output.retainedBytes, 2 + 3 + 4 + 3);
});

test('output beyond 10 MiB drops the oldest entries, and the window stays within the bound', () => {
  const full = chunks(CHUNKS_IN_WINDOW);
  assert.equal(full.output.retainedBytes, OUTPUT_RETENTION_BYTES);
  assert.equal(full.output.entries[0]?.position, 1);
  const over = appended(full, 'y');
  assert.equal(over.output.entries[0]?.position, 2);
  assert.equal(over.output.lastPosition, CHUNKS_IN_WINDOW + 1);
  assert.ok(over.output.retainedBytes <= OUTPUT_RETENTION_BYTES);
});

test('a cursor that left the window is cursor-expired with the earliest retained position', () => {
  const over = appended(chunks(CHUNKS_IN_WINDOW), 'y', 'z');
  assert.deepEqual(value(readOutputAfter(over, 0)), { kind: 'cursor-expired', earliestRetained: 3 });
  assert.deepEqual(value(readOutputAfter(over, 1)), { kind: 'cursor-expired', earliestRetained: 3 });
  const read = value(readOutputAfter(over, 2));
  assert.equal(read.kind === 'entries' && read.entries.length, CHUNKS_IN_WINDOW);
});

test('a cursor that is not a position of the session fails with invalid', () => {
  const session = appended(sessionWithRunningTurn(), 'a');
  for (const cursor of [-1, 1.5, 2, Number.NaN]) assert.equal(failed(readOutputAfter(session, cursor)).code, 'invalid');
});

test('output needs a running turn of the running generation and text within its bound', () => {
  const running = submitted(sessionWithRunningTurn(), 'turn-2');
  const of = (name: string, at = 1, text = 'out') => appendOutput(running, { turnId: turnId(name), generation: generation(at), text });
  assert.equal(failed(of('turn-2')).code, 'precondition-failed');
  assert.equal(failed(of('nope')).code, 'not-found');
  assert.equal(failed(of('turn-1', 2)).code, 'precondition-failed');
  assert.equal(failed(of('turn-1', 1, `${CHUNK}x`)).code, 'invalid');
  assert.ok(value(of('turn-1', 1, '')));
  const ended = value(recordTurnOutcome(running, { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' }));
  assert.equal(failed(appendOutput(ended, { turnId: turnId('turn-1'), generation: generation(1), text: 'late' })).code, 'precondition-failed');
  const stopped = value(endGeneration(running, generation(1)));
  assert.equal(failed(appendOutput(stopped, { turnId: turnId('turn-1'), generation: generation(1), text: 'late' })).code, 'precondition-failed');
});
