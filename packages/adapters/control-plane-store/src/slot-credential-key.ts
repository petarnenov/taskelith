import { err, failure, type Result } from '@taskelith/kernel';
import type { ControlPlaneNamespace } from './control-plane-namespace.js';
import { ControlPlaneKeyFile } from './control-plane-key-file.js';

export const SLOT_CREDENTIAL_KEY_FILE = 'slot-credential-key';
export const SLOT_CREDENTIAL_KEY_LENGTH = 32;

// `control-plane/slot-credential-key`: the key that encrypts slot
// credentials, never in the database (account pool contract section 1).
export class SlotCredentialKeyFile extends ControlPlaneKeyFile {
  constructor(namespace: ControlPlaneNamespace) {
    super(namespace, SLOT_CREDENTIAL_KEY_FILE);
  }

  // The size names the bytes counted, never their content.
  override read(): Result<Uint8Array> {
    const stored = super.read();
    if (!stored.ok || stored.value.length === SLOT_CREDENTIAL_KEY_LENGTH) return stored;
    const reason = `${SLOT_CREDENTIAL_KEY_FILE} has ${stored.value.length} bytes, not ${SLOT_CREDENTIAL_KEY_LENGTH}`;
    return err(failure('precondition-failed', reason));
  }
}
