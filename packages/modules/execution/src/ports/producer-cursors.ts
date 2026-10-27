import type { Instant, Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import type { JournalId, ProducerCursor } from '../domain/observation-sequence.js';

// One journal the control plane has seen from a worker: its cursor, when it
// was retired, if it was, and the highest inventory `snapshot` received.
export interface ProducerJournal {
  readonly cursor: ProducerCursor;
  readonly retiredAt?: Instant;
  readonly reportedSnapshot: number;
}

// The producer cursor of each `(workerId, journalId)`, written in the
// transaction that applies an observation; `get` starts an unknown one.
export interface ProducerCursors {
  get(workerId: WorkerId, journalId: JournalId): Promise<ProducerCursor>;
  // Inserts or replaces the cursor of its worker and journal.
  save(cursor: ProducerCursor): Promise<Result<void>>;
  // Every journal of the worker with a stored row, in journal order.
  listByWorker(workerId: WorkerId): Promise<readonly ProducerJournal[]>;
  // Retires the journal, stored first if unknown; the first time is kept.
  retire(workerId: WorkerId, journalId: JournalId, at: Instant): Promise<Result<void>>;
  // Raises the highest received `snapshot`, stored first if unknown.
  recordReportedSnapshot(workerId: WorkerId, journalId: JournalId, snapshot: number): Promise<Result<void>>;
}
