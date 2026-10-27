import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import { startProducerCursor, type JournalId, type ProducerCursor } from '../domain/observation-sequence.js';
import type { ProducerCursors, ProducerJournal } from '../ports/producer-cursors.js';

// Keeps each producer's journal in process memory.
export class InMemoryProducerCursors implements ProducerCursors {
  readonly #journals = new Map<string, ProducerJournal>();

  async get(workerId: WorkerId, journalId: JournalId): Promise<ProducerCursor> {
    return this.#journal(workerId, journalId).cursor;
  }

  async save(cursor: ProducerCursor): Promise<Result<void>> {
    return this.#change(cursor.workerId, cursor.journalId, (journal) => ({ ...journal, cursor }));
  }

  async listByWorker(workerId: WorkerId): Promise<readonly ProducerJournal[]> {
    return [...this.#journals.values()]
      .filter((journal) => journal.cursor.workerId === workerId)
      .sort((left, right) => (left.cursor.journalId < right.cursor.journalId ? -1 : 1));
  }

  async retire(workerId: WorkerId, journalId: JournalId, at: Instant): Promise<Result<void>> {
    return this.#change(workerId, journalId, (journal) => ({ ...journal, retiredAt: journal.retiredAt ?? at }));
  }

  async recordReportedSnapshot(workerId: WorkerId, journalId: JournalId, snapshot: number): Promise<Result<void>> {
    return this.#change(workerId, journalId, (journal) => ({ ...journal, reportedSnapshot: Math.max(journal.reportedSnapshot, snapshot) }));
  }

  #journal(workerId: WorkerId, journalId: JournalId): ProducerJournal {
    return this.#journals.get(keyOf(workerId, journalId)) ?? { cursor: startProducerCursor(workerId, journalId), reportedSnapshot: 0 };
  }

  #change(workerId: WorkerId, journalId: JournalId, change: (journal: ProducerJournal) => ProducerJournal): Result<void> {
    this.#journals.set(keyOf(workerId, journalId), Object.freeze(change(this.#journal(workerId, journalId))));
    return ok(undefined);
  }
}

function keyOf(workerId: WorkerId, journalId: JournalId): string {
  return JSON.stringify([workerId, journalId]);
}
