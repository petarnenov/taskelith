import { ok, type Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import { startProducerCursor, type JournalId, type ProducerCursor } from '../domain/observation-sequence.js';
import type { ProducerCursors } from '../ports/producer-cursors.js';

// Keeps each producer's cursor in process memory.
export class InMemoryProducerCursors implements ProducerCursors {
  readonly #cursors = new Map<string, ProducerCursor>();

  async get(workerId: WorkerId, journalId: JournalId): Promise<ProducerCursor> {
    return this.#cursors.get(keyOf(workerId, journalId)) ?? startProducerCursor(workerId, journalId);
  }

  async save(cursor: ProducerCursor): Promise<Result<void>> {
    this.#cursors.set(keyOf(cursor.workerId, cursor.journalId), cursor);
    return ok(undefined);
  }
}

function keyOf(workerId: WorkerId, journalId: JournalId): string {
  return JSON.stringify([workerId, journalId]);
}
