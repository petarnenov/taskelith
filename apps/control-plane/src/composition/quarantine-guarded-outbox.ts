import { ok, type EventId, type Result } from '@taskelith/kernel';
import type { OutboxSource } from '@taskelith/nats';
import type { PostgresDatabase, PostgresOutboxRelay } from '@taskelith/postgres';
import type { OutboxMessage } from '@taskelith/sdlc';

// No outbox row leaves under restore quarantine (trust model 2); the check
// and the read share a transaction, and a missing record reads quarantined.
export class QuarantineGuardedOutbox implements OutboxSource {
  readonly #database: PostgresDatabase;
  readonly #relay: PostgresOutboxRelay;

  constructor(database: PostgresDatabase, relay: PostgresOutboxRelay) {
    this.#database = database;
    this.#relay = relay;
  }

  unpublished(limit: number): Promise<Result<readonly OutboxMessage[]>> {
    return this.#database.transaction(async (tx) => ok((await tx.installation.quarantined()) ? [] : await tx.outbox.unpublished(limit)));
  }

  markPublished(eventId: EventId): Promise<Result<void>> {
    return this.#relay.markPublished(eventId);
  }
}
