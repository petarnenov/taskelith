import type { Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import type { JournalId, ProducerCursor } from '../domain/observation-sequence.js';

// The producer cursor of each `(workerId, journalId)`, written in the
// transaction that applies an observation; `get` starts an unknown one.
export interface ProducerCursors {
  get(workerId: WorkerId, journalId: JournalId): Promise<ProducerCursor>;
  // Inserts or replaces the cursor of its worker and journal.
  save(cursor: ProducerCursor): Promise<Result<void>>;
}
