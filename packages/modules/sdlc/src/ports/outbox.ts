import type { EventMetadata, Result } from '@taskelith/kernel';

// A message written in the transaction of the state it reports; a publisher
// sends it later under the same event identity.
export interface OutboxMessage {
  readonly metadata: EventMetadata;
  readonly subject: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

// Appends fail with `conflict` for an event identity already in the outbox.
export interface Outbox {
  append(message: OutboxMessage): Promise<Result<void>>;
}
