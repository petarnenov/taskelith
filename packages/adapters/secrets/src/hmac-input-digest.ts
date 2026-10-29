import { createHmac } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';

export const INPUT_DIGEST_KEY_BYTES = 32;

// HMAC-SHA-256 of a command's unredacted input (control-plane wire
// contracts, section 7), the Execution module's InputDigest port.
export class HmacInputDigest {
  readonly #key: Buffer;

  private constructor(key: Buffer) {
    this.#key = key;
  }

  // A key of another size is refused; the reason names only its size.
  static fromKey(key: Uint8Array): Result<HmacInputDigest> {
    if (key.length !== INPUT_DIGEST_KEY_BYTES) {
      return err(failure('precondition-failed', `the input digest key has ${key.length} bytes, not ${INPUT_DIGEST_KEY_BYTES}`));
    }
    return ok(new HmacInputDigest(Buffer.from(key)));
  }

  digest(input: string): string {
    return createHmac('sha256', this.#key).update(input, 'utf8').digest('hex');
  }
}
