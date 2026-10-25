import { ok, type EventId, type Result } from '@taskelith/kernel';
import type { OutboxMessage } from '@taskelith/sdlc';
import { NO_CRASH_POINTS, type CrashPointHook } from './crash-points.js';
import type { PostgresDatabase } from './postgres-database.js';

// What a publisher reads from the outbox and marks after the broker accepted
// a message; item 12's publisher sends each one under its event identity.
export class PostgresOutboxRelay {
  readonly #database: PostgresDatabase;
  readonly #crashPoints: CrashPointHook;

  constructor(database: PostgresDatabase, crashPoints: CrashPointHook = NO_CRASH_POINTS) {
    this.#database = database;
    this.#crashPoints = crashPoints;
  }

  unpublished(limit: number): Promise<Result<readonly OutboxMessage[]>> {
    return this.#database.transaction(async (tx) => ok(await tx.outbox.unpublished(limit)));
  }

  async markPublished(eventId: EventId): Promise<Result<void>> {
    this.#crashPoints.reach('OutboxPublish.before');
    const marked = await this.#database.transaction((tx) => tx.outbox.markPublished(eventId));
    if (marked.ok) this.#crashPoints.reach('OutboxPublish.after');
    return marked;
  }
}
