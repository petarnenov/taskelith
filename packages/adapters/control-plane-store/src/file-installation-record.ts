import { installationIdentity, type InstallationIdentity, type InstallationRecord } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneNamespace } from './control-plane-namespace.js';

export const INSTALLATION_FILE = 'installation';

// `control-plane/installation`: the identity a database restore cannot roll
// back (trust model section 2), created once and never rewritten here.
export class FileInstallationRecord implements InstallationRecord {
  readonly #namespace: ControlPlaneNamespace;

  constructor(namespace: ControlPlaneNamespace) {
    this.#namespace = namespace;
  }

  async read(): Promise<Result<InstallationIdentity | undefined>> {
    const stored = this.#namespace.read(INSTALLATION_FILE);
    if (!stored.ok) return stored;
    if (stored.value === undefined) return ok(undefined);
    const { installationId, recoveryEpoch } = stored.value;
    if (typeof installationId !== 'string' || typeof recoveryEpoch !== 'number') {
      return err(failure('precondition-failed', 'the installation record has invalid fields'));
    }
    const identity = installationIdentity(installationId, recoveryEpoch);
    return identity.ok ? ok(identity.value) : err(failure('precondition-failed', 'the installation record has invalid fields'));
  }

  async create(identity: InstallationIdentity): Promise<Result<void>> {
    return this.#namespace.create(INSTALLATION_FILE, { installationId: identity.installationId, recoveryEpoch: identity.recoveryEpoch });
  }
}
