import { err, failure, ok, REDACTED, type Result } from '@taskelith/kernel';

// A subscription token that only reveal() discloses, so that a logged or
// serialized one shows nothing (account pool contract sections 6.2, 7.1).
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

  // Keeps console.log and util.inspect from showing the credential.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
