import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { err, failure, ok, REDACTED, type Result } from '@taskelith/kernel';

export const SLOT_CREDENTIAL_KEY_BYTES = 32;
const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedText {
  readonly nonce: Uint8Array;
  readonly sealed: Uint8Array;
}

// AES-256-GCM with a random nonce per seal; the context is authenticated
// data, so a ciphertext opens only for the slot and version it was sealed for.
export class AesGcmSlotCredentialCipher {
  readonly #key: Buffer;

  private constructor(key: Buffer) {
    this.#key = key;
  }

  static of(key: Uint8Array): Result<AesGcmSlotCredentialCipher> {
    if (key.length !== SLOT_CREDENTIAL_KEY_BYTES) {
      return err(failure('invalid', `a slot credential key has ${SLOT_CREDENTIAL_KEY_BYTES} bytes`));
    }
    return ok(new AesGcmSlotCredentialCipher(Buffer.from(key)));
  }

  seal(text: string, context: string): SealedText {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return { nonce, sealed: Buffer.concat([body, cipher.getAuthTag()]) };
  }

  // Undefined for a wrong key, context, or a changed ciphertext.
  open({ nonce, sealed }: SealedText, context: string): string | undefined {
    if (nonce.length !== NONCE_BYTES || sealed.length < TAG_BYTES) return undefined;
    const bytes = Buffer.from(sealed);
    try {
      const decipher = createDecipheriv(ALGORITHM, this.#key, Buffer.from(nonce), { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
      return Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - TAG_BYTES)), decipher.final()]).toString('utf8');
    } catch {
      return undefined;
    }
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // Keeps console.log and util.inspect from showing the key.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
