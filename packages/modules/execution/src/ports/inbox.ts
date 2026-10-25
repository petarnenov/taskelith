import type { EventId, Result } from '@taskelith/kernel';

export type InboxOutcome = 'accepted' | 'duplicate';

// Records each message a consumer applies, once; the consumer records it in
// the transaction that applies it, and skips a `duplicate`.
export interface Inbox {
  accept(consumer: string, messageId: EventId): Promise<Result<InboxOutcome>>;
}
