import { err, failure, type Result } from '@taskelith/kernel';
import { AesGcmSlotCredentialCipher, SLOT_CREDENTIAL_KEY_BYTES } from './slot-credential-cipher.js';

export const SCM_SECRET_KEY_BYTES = SLOT_CREDENTIAL_KEY_BYTES;

// The 12a AES-256-GCM cipher under the SCM integration secret key, never
// the slot key; a key of another size is refused, naming only its size.
export function scmSecretCipher(key: Uint8Array): Result<AesGcmSlotCredentialCipher> {
  if (key.length !== SCM_SECRET_KEY_BYTES) {
    return err(failure('precondition-failed', `the SCM integration secret key has ${key.length} bytes, not ${SCM_SECRET_KEY_BYTES}`));
  }
  return AesGcmSlotCredentialCipher.of(key);
}
