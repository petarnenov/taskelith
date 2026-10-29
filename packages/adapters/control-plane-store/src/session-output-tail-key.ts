import type { ControlPlaneNamespace } from './control-plane-namespace.js';
import { ControlPlaneKeyFile } from './control-plane-key-file.js';

export const SESSION_OUTPUT_TAIL_KEY_FILE = 'session-output-tail.key';

// `control-plane/session-output-tail.key`, the AES-256-GCM key of the held
// output tails at rest (coordinator answer Q2 of 13d).
export class SessionOutputTailKeyFile extends ControlPlaneKeyFile {
  constructor(namespace: ControlPlaneNamespace) {
    super(namespace, SESSION_OUTPUT_TAIL_KEY_FILE);
  }
}
