import { ok, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { OWNER_LOGIN_NAME, parsePrincipalId, type PrincipalId } from '../domain/principal.js';
import { INSTALLATION_OWNER } from '../domain/roles.js';
import type { AccessStore, AccessTransaction } from '../ports/access-store.js';
import type { RandomValues } from '../ports/random-values.js';
import { checkInvocation, type AdministrativeInvocation } from './operator-credential-service.js';

export interface OwnerBootstrapDependencies {
  readonly store: AccessStore;
  readonly random: RandomValues;
  readonly clock: Clock;
}

export interface BootstrappedOwner {
  readonly principalId: PrincipalId;
  // False when the owner already existed; nothing was written then.
  readonly created: boolean;
}

// Creates the first installation-owner exactly once (decision 7): the
// principal, its role, the binding, and the audit event in one write.
export class OwnerBootstrapService {
  readonly #deps: OwnerBootstrapDependencies;

  constructor(dependencies: OwnerBootstrapDependencies) {
    this.#deps = dependencies;
  }

  async ensureOwner(invocation: AdministrativeInvocation): Promise<Result<BootstrappedOwner>> {
    const checked = checkInvocation(invocation);
    if (!checked.ok) return checked;
    const created = await this.#deps.store.transaction((tx) => this.#create(tx, invocation));
    if (created.ok || created.error.code !== 'conflict') return created;
    // A concurrent start bound the owner first; its principal is the one.
    return this.#deps.store.transaction((tx) => existingOwner(tx, created));
  }

  async #create(tx: AccessTransaction, invocation: AdministrativeInvocation): Promise<Result<BootstrappedOwner>> {
    const bound = await tx.principals.operatorPrincipal();
    if (!bound.ok) return bound;
    if (bound.value !== undefined) return ok({ principalId: bound.value, created: false });
    const principalId = parsePrincipalId(this.#deps.random.principalId());
    if (!principalId.ok) return principalId;
    const at = this.#deps.clock.now();
    const principal = { principalId: principalId.value, kind: 'operator' as const, loginName: OWNER_LOGIN_NAME, createdAt: at };
    const steps = [
      () => tx.principals.add(principal),
      () => tx.principals.grantInstallationOwner(principalId.value, at),
      () => tx.principals.bindOperator(principalId.value),
      () => tx.audit.append({
        kind: 'access.owner-created', principalId: principalId.value, role: INSTALLATION_OWNER,
        actor: invocation.actor, reason: invocation.reason, occurredAt: at,
      }),
    ];
    for (const step of steps) {
      const done = await step();
      if (!done.ok) return done;
    }
    return ok({ principalId: principalId.value, created: true });
  }
}

async function existingOwner(tx: AccessTransaction, conflict: Result<BootstrappedOwner>): Promise<Result<BootstrappedOwner>> {
  const bound = await tx.principals.operatorPrincipal();
  if (!bound.ok) return bound;
  return bound.value === undefined ? conflict : ok({ principalId: bound.value, created: false });
}
