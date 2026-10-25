import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { Outbox, OutboxMessage } from '../ports/outbox.js';

// Keeps appended messages in order, for tests and single-process composition.
export class InMemoryOutbox implements Outbox {
  readonly #messages: OutboxMessage[] = [];

  get messages(): readonly OutboxMessage[] {
    return [...this.#messages];
  }

  async append(message: OutboxMessage): Promise<Result<void>> {
    const { eventId } = message.metadata;
    if (this.#messages.some((stored) => stored.metadata.eventId === eventId)) {
      return err(failure('conflict', `outbox message ${eventId} already exists`, { event: eventId }));
    }
    this.#messages.push(message);
    return ok(undefined);
  }
}
