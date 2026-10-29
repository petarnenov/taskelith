import { err, failure, type Result } from '@taskelith/kernel';
import { AesGcmSlotCredentialCipher, SLOT_CREDENTIAL_KEY_BYTES } from './slot-credential-cipher.js';

export const OUTPUT_TAIL_KEY_BYTES = SLOT_CREDENTIAL_KEY_BYTES;

// The 12a AES-256-GCM cipher under the session output tail key; a key of
// another size is refused with a reason that names only its size.
export function outputTailCipher(key: Uint8Array): Result<AesGcmSlotCredentialCipher> {
  if (key.length !== OUTPUT_TAIL_KEY_BYTES) {
    return err(failure('precondition-failed', `the session output tail key has ${key.length} bytes, not ${OUTPUT_TAIL_KEY_BYTES}`));
  }
  return AesGcmSlotCredentialCipher.of(key);
}
