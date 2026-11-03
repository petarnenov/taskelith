import type { ControlPlaneNamespace } from './control-plane-namespace.js';
import { ControlPlaneKeyFile } from './control-plane-key-file.js';

export const SCM_INTEGRATION_SECRET_KEY_FILE = 'scm-integration-secrets.key';

// `control-plane/scm-integration-secrets.key`, the AES-256-GCM key of the
// SCM integrations' secrets at rest (G3 item 20f); never the slot key.
export class ScmIntegrationSecretKeyFile extends ControlPlaneKeyFile {
  constructor(namespace: ControlPlaneNamespace) {
    super(namespace, SCM_INTEGRATION_SECRET_KEY_FILE);
  }
}
