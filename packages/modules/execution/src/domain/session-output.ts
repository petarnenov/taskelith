import { ok, type Result } from '@taskelith/kernel';
import { MAX_HARNESS_TEXT_LENGTH } from './harness-values.js';
import {
  frozenCopy,
  isLiveTurn,
  isTextWithin,
  sessionFailure,
  withChanges,
  type OutputAppend,
  type OutputEntry,
  type OutputRead,
  type OutputWindow,
  type Session,
} from './session-records.js';

// The live stream bound per active attempt (operational targets, section 2).
export const OUTPUT_RETENTION_BYTES = 10 * 1024 * 1024;

// Appends output at the next position and drops the oldest entries that no
// longer fit the retained window (contract, section 7).
export function appendOutput(session: Session, output: OutputAppend): Result<Session> {
  if (!isTextWithin(output.text, 0, MAX_HARNESS_TEXT_LENGTH)) return sessionFailure('invalid', session, 'got output text out of bounds');
  const turn = session.turns.find((candidate) => candidate.id === output.turnId);
  if (turn === undefined) return sessionFailure('not-found', session, `has no turn ${output.turnId}`);
  if (!isLiveTurn(session, turn, output.generation)) {
    return sessionFailure('precondition-failed', session, `does not run turn ${turn.id} in generation ${output.generation}`);
  }
  const position = session.output.lastPosition + 1;
  const entry: OutputEntry = { turnId: output.turnId, generation: output.generation, text: output.text, position };
  return ok(withChanges(session, { output: withinBound([...session.output.entries, entry], session.output.retainedBytes, entry) }));
}

export function readOutputAfter(session: Session, cursor: number): Result<OutputRead> {
  const { entries, lastPosition } = session.output;
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > lastPosition) {
    return sessionFailure('invalid', session, `has no output position ${cursor}`);
  }
  const earliestRetained = entries[0]?.position ?? lastPosition + 1;
  if (cursor < earliestRetained - 1) return ok(Object.freeze({ kind: 'cursor-expired', earliestRetained }));
  return ok(Object.freeze({ kind: 'entries', entries: Object.freeze(entries.filter((entry) => entry.position > cursor)) }));
}

function withinBound(entries: readonly OutputEntry[], retainedBefore: number, added: OutputEntry): OutputWindow {
  let retainedBytes = retainedBefore + utf8Length(added.text);
  let dropped = 0;
  for (const entry of entries) {
    if (retainedBytes <= OUTPUT_RETENTION_BYTES) break;
    retainedBytes -= utf8Length(entry.text);
    dropped += 1;
  }
  return frozenCopy({ entries: entries.slice(dropped), retainedBytes, lastPosition: added.position });
}

// A lone surrogate counts 3 bytes, as its UTF-8 replacement character does.
function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) bytes += utf8Width(character.codePointAt(0) ?? 0);
  return bytes;
}

function utf8Width(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  return codePoint < 0x10000 ? 3 : 4;
}
