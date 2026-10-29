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

// What follows a run of non-whitespace characters, or a secret block, that
// passed the held tail's bound and was recorded as one marker.
export type OutputContinuation = 'none' | 'word' | 'block';

// A turn's held output tail: unredacted text that is never shown, and what
// is still dropped as the continuation of a cut secret.
export interface HeldOutput {
  readonly text: string;
  readonly continuation: OutputContinuation;
}

export interface OutputSplit {
  // Redacted text to record now.
  readonly released: string;
  readonly held: HeldOutput;
}

// Redacts a turn's output as one text (control-plane wire contracts,
// section 7): `split` holds back what could still be or start a secret.
export interface SessionOutputRedactor {
  split(held: HeldOutput, chunk: string, bound: number): OutputSplit;
  // The redacted text of a held tail at its turn's end.
  release(held: HeldOutput): string;
}

export interface SealedBytes {
  readonly nonce: Uint8Array;
  readonly sealed: Uint8Array;
}

// Seals a held tail at rest; `open` answers undefined for another key or
// context, or a changed ciphertext.
export interface OutputTailCipher {
  seal(text: string, context: string): SealedBytes;
  open(sealed: SealedBytes, context: string): string | undefined;
}
