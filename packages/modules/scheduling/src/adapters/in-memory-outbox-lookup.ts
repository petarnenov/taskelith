import type { EventId } from '@taskelith/kernel';
import type { OutboxLookup, OutboxMessage } from '../ports/outbox.js';

// Finds a message among those an in-memory outbox holds.
export class InMemoryOutboxLookup implements OutboxLookup {
  readonly #messages: () => readonly OutboxMessage[];

  constructor(messages: () => readonly OutboxMessage[]) {
    this.#messages = messages;
  }

  async byEventId(eventId: EventId): Promise<OutboxMessage | undefined> {
    return this.#messages().find((message) => message.metadata.eventId === eventId);
  }
}
