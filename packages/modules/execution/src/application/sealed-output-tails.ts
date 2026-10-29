import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { SessionGeneration, SessionId, TurnId } from '../domain/identifiers.js';
import type { HeldOutput, OutputContinuation, OutputTailCipher } from '../ports/session-input.js';
import type { SessionTimelineTransaction } from '../ports/session-timeline-store.js';

export const NOTHING_HELD: HeldOutput = Object.freeze({ text: '', continuation: 'none' });

// The turn that a held tail belongs to.
export interface TailOwner {
  readonly turnId: TurnId;
  readonly generation: SessionGeneration;
}

// A held tail as the service reads it, opened.
export interface OpenedTail extends TailOwner {
  readonly version: number;
  readonly held: HeldOutput;
}

const CONTINUATIONS: ReadonlySet<string> = new Set<OutputContinuation>(['none', 'word', 'block']);

// Keeps each session's held output tail only as ciphertext (coordinator
// answer Q2 of 13d); a tail that does not open fails with `internal`.
export class SealedOutputTails {
  readonly #cipher: OutputTailCipher;

  constructor(cipher: OutputTailCipher) {
    this.#cipher = cipher;
  }

  async read(tx: SessionTimelineTransaction, sessionId: SessionId): Promise<Result<OpenedTail | undefined>> {
    const stored = await tx.tails.get(sessionId);
    if (!stored.ok) return stored;
    if (stored.value === undefined) return ok(undefined);
    const { turnId, generation, version, nonce, sealed } = stored.value;
    const opened = this.#cipher.open({ nonce, sealed }, tailContext(sessionId, turnId, version));
    const held = opened === undefined ? undefined : heldOf(opened);
    if (held === undefined) return err(failure('internal', `the held output tail of session ${sessionId} does not open`, { session: sessionId }));
    return ok(Object.freeze({ turnId, generation, version, held }));
  }

  // Writes the tail under the next version, or clears it when it holds
  // nothing; each version seals under its own authenticated data.
  async write(tx: SessionTimelineTransaction, sessionId: SessionId, owner: TailOwner, held: HeldOutput, previous?: OpenedTail): Promise<Result<void>> {
    if (isEmpty(held)) return previous === undefined ? ok(undefined) : tx.tails.clear(sessionId);
    const version = (previous?.version ?? 0) + 1;
    const plain = JSON.stringify({ text: held.text, continuation: held.continuation });
    const { nonce, sealed } = this.#cipher.seal(plain, tailContext(sessionId, owner.turnId, version));
    return tx.tails.put(Object.freeze({ sessionId, turnId: owner.turnId, generation: owner.generation, version, nonce, sealed }));
  }
}

function isEmpty(held: HeldOutput): boolean {
  return held.text === '' && held.continuation === 'none';
}

// JSON escapes a lone surrogate, so every string the domain accepts
// survives the UTF-8 of the cipher.
function heldOf(plain: string): HeldOutput | undefined {
  try {
    const { text, continuation } = JSON.parse(plain) as Partial<HeldOutput>;
    if (typeof text !== 'string' || typeof continuation !== 'string' || !CONTINUATIONS.has(continuation)) return undefined;
    return Object.freeze({ text, continuation });
  } catch {
    return undefined;
  }
}

function tailContext(sessionId: SessionId, turnId: TurnId, version: number): string {
  return JSON.stringify(['session-output-tail', sessionId, turnId, version]);
}
