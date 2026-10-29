import type { TurnId } from '../domain/identifiers.js';

// A keyed digest of a command's unredacted input (control-plane wire
// contracts, section 7); the key never leaves the adapter.
export interface InputDigest {
  digest(input: string): string;
}

// Redacts secrets from session text before the timeline records it.
export interface SessionTextRedactor {
  redact(text: string): string;
}

// Mints the TurnId of each new turn (session timeline, section 2 rule 6).
export interface TurnIdSource {
  next(): TurnId;
}
