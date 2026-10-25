import type { EventMetadata, Result } from '@taskelith/kernel';
import type { JsonObject } from '@taskelith/sdlc';

// A command written in the transaction of the placement that requires it; a
// publisher sends it later under the same event identity.
export interface OutboxMessage {
  readonly metadata: EventMetadata;
  readonly subject: string;
  readonly payload: JsonObject;
}

// Appends fail with `conflict` for an event identity already in the outbox
// and with `invalid` for a payload that JSON cannot carry unchanged.
export interface Outbox {
  append(message: OutboxMessage): Promise<Result<void>>;
}
