import { err, failure, ok, type Identifier, type Result } from '@taskelith/kernel';
import type { WorkerId } from './identifiers.js';

export type JournalId = Identifier<'JournalId'>;
export type ObservationId = Identifier<'ObservationId'>;

declare const sequenceBrand: unique symbol;

// A position in a producer's gapless sequence; only parseSequence creates it.
export type Sequence = number & { readonly [sequenceBrand]: true };

// Where an observation sits in its producer's gapless sequence per
// `(workerId, journalId)` (worker journal contract, section 6).
export interface ObservationPosition {
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly sequence: Sequence;
  readonly observationId: ObservationId;
}

// What the control plane has applied of one journal incarnation. It confirms
// cumulatively through the contiguous prefix; later ones wait for the gap.
export interface ProducerCursor {
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly confirmedThrough: number;
  readonly appliedAbove: readonly Sequence[];
}

// `rollback` and `new-incarnation` mean the worker lost local history, which
// reconciliation handles; a gap is applied and confirmed only once closed.
export const SEQUENCE_CLASSES = Object.freeze(['new', 'duplicate', 'rollback', 'new-incarnation'] as const);

export type SequenceClass = (typeof SEQUENCE_CLASSES)[number];

export function startProducerCursor(workerId: WorkerId, journalId: JournalId): ProducerCursor {
  return Object.freeze({ workerId, journalId, confirmedThrough: 0, appliedAbove: Object.freeze([]) });
}

export function parseSequence(value: number): Result<Sequence> {
  if (!Number.isSafeInteger(value) || value < 1) return err(failure('invalid', 'sequence must be a positive integer'));
  return ok(value as Sequence);
}

// `recordedAtSequence` is the identity already applied at that sequence, if
// any; the same identity there is a repeated publication.
export function classifyObservation(
  cursor: ProducerCursor,
  position: ObservationPosition,
  recordedAtSequence?: ObservationId,
): Result<SequenceClass> {
  if (position.workerId !== cursor.workerId) {
    return err(failure('forbidden', `observation of worker ${position.workerId} is not in the cursor of ${cursor.workerId}`));
  }
  if (position.journalId !== cursor.journalId) return ok('new-incarnation');
  if (!isApplied(cursor, position.sequence)) return ok('new');
  return ok(recordedAtSequence === position.observationId ? 'duplicate' : 'rollback');
}

export function recordAppliedSequence(cursor: ProducerCursor, sequence: Sequence): Result<ProducerCursor> {
  if (isApplied(cursor, sequence)) {
    return err(failure('conflict', `sequence ${sequence} of journal ${cursor.journalId} is already applied`));
  }
  const above = [...cursor.appliedAbove, sequence].sort((left, right) => left - right);
  let confirmedThrough = cursor.confirmedThrough;
  while (above[0] === confirmedThrough + 1) {
    confirmedThrough += 1;
    above.shift();
  }
  return ok(Object.freeze({ ...cursor, confirmedThrough, appliedAbove: Object.freeze(above) }));
}

function isApplied(cursor: ProducerCursor, sequence: Sequence): boolean {
  return sequence <= cursor.confirmedThrough || cursor.appliedAbove.includes(sequence);
}
