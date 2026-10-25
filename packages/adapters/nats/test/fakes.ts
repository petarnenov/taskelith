import { err, failure, ok, type EventId, type Result } from '@taskelith/kernel';
import type { OutboxSource } from '@taskelith/nats';
import type { OutboxMessage } from '@taskelith/sdlc';

export function outboxRow(eventId: string, subject: string, payload: object = { eventId }): OutboxMessage {
  return { metadata: { eventId: eventId as EventId }, subject, payload } as unknown as OutboxMessage;
}

// An outbox in memory, with the failures a PostgreSQL outbox can return.
export class FakeOutbox implements OutboxSource {
  readonly rows: OutboxMessage[];
  readonly published: string[] = [];
  readonly failMarkFor = new Set<string>();
  unavailable = false;
  onMark: (eventId: string) => void = () => {};

  constructor(rows: OutboxMessage[]) {
    this.rows = rows;
  }

  async unpublished(limit: number): Promise<Result<readonly OutboxMessage[]>> {
    if (this.unavailable) return err(failure('unavailable', 'outbox down'));
    return ok(this.rows.filter((row) => !this.published.includes(row.metadata.eventId)).slice(0, limit));
  }

  async markPublished(eventId: EventId): Promise<Result<void>> {
    this.onMark(eventId);
    if (this.failMarkFor.has(eventId)) return err(failure('unavailable', 'lost commit'));
    this.published.push(eventId);
    return ok(undefined);
  }
}
