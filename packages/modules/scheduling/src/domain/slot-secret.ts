import { err, failure, ok, type Result } from '@taskelith/kernel';

export const REDACTED = '[redacted]';

// Credential text that only reveal() discloses, so that a logged or
// serialized secret shows nothing (account pool contract section 6.2).
export class SlotSecret {
  readonly #text: string;

  private constructor(text: string) {
    this.#text = text;
  }

  static of(text: string): Result<SlotSecret> {
    return text.length === 0 ? err(failure('invalid', 'a slot credential must not be empty')) : ok(new SlotSecret(text));
  }

  reveal(): string {
    return this.#text;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
