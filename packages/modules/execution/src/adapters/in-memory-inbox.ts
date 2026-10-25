import { ok, type EventId, type Result } from '@taskelith/kernel';
import type { Inbox, InboxOutcome } from '../ports/inbox.js';

// Keeps the applied message identities of each consumer in process memory.
export class InMemoryInbox implements Inbox {
  readonly #accepted = new Set<string>();

  async accept(consumer: string, messageId: EventId): Promise<Result<InboxOutcome>> {
    const key = JSON.stringify([consumer, messageId]);
    if (this.#accepted.has(key)) return ok('duplicate');
    this.#accepted.add(key);
    return ok('accepted');
  }
}
