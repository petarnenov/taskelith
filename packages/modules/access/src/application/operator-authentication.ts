import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { PrincipalId } from '../domain/principal.js';
import type { AccessStore } from '../ports/access-store.js';

export interface OperatorCredentialCheck {
  authenticate(secret: string): Promise<Result<void>>;
}

// The bearer authenticates the principal bound to the operator credential,
// the first installation-owner (wire contracts section 2).
export class OperatorAuthentication {
  readonly #credentials: OperatorCredentialCheck;
  readonly #store: AccessStore;

  constructor(credentials: OperatorCredentialCheck, store: AccessStore) {
    this.#credentials = credentials;
    this.#store = store;
  }

  async authenticate(secret: string): Promise<Result<PrincipalId>> {
    const authenticated = await this.#credentials.authenticate(secret);
    if (!authenticated.ok) return authenticated;
    const bound = await this.#store.transaction((tx) => tx.principals.operatorPrincipal());
    if (!bound.ok) return bound;
    if (bound.value !== undefined) return ok(bound.value);
    return err(failure('unavailable', 'the operator credential has no principal; start the control plane to create it'));
  }
}
