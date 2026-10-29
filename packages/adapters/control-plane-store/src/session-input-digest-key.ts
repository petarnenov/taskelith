import type { ControlPlaneNamespace } from './control-plane-namespace.js';
import { ControlPlaneKeyFile } from './control-plane-key-file.js';

export const SESSION_INPUT_DIGEST_KEY_FILE = 'session-input-digest.key';

// `control-plane/session-input-digest.key`, the HMAC key of the session
// inputs' digests (coordinator answer Q4 of 13a).
export class SessionInputDigestKeyFile extends ControlPlaneKeyFile {
  constructor(namespace: ControlPlaneNamespace) {
    super(namespace, SESSION_INPUT_DIGEST_KEY_FILE);
  }
}
