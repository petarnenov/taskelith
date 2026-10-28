import { ok, type Instant, type Result } from '@taskelith/kernel';
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
  // False when the owner already existed; only an audit event was written.
  readonly created: boolean;
}

// Creates the first installation-owner exactly once in one write (decision
// 7), and audits every repeat, refused or not.
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
    return this.#deps.store.transaction((tx) => this.#existingOwner(tx, created, invocation));
  }

  // A refused rerun of `init`: names the bound owner, if any, and no secret.
  async recordRefusedBootstrap(invocation: AdministrativeInvocation): Promise<Result<void>> {
    const checked = checkInvocation(invocation);
    if (!checked.ok) return checked;
    return this.#deps.store.transaction(async (tx) => {
      const bound = await tx.principals.operatorPrincipal();
      if (!bound.ok) return bound;
      return this.#audit(tx, 'access.owner-bootstrap-refused', bound.value, invocation, this.#deps.clock.now());
    });
  }

  async #create(tx: AccessTransaction, invocation: AdministrativeInvocation): Promise<Result<BootstrappedOwner>> {
    const bound = await tx.principals.operatorPrincipal();
    if (!bound.ok) return bound;
    if (bound.value !== undefined) return this.#repeated(tx, bound.value, invocation);
    const principalId = parsePrincipalId(this.#deps.random.principalId());
    if (!principalId.ok) return principalId;
    const at = this.#deps.clock.now();
    const principal = { principalId: principalId.value, kind: 'operator' as const, loginName: OWNER_LOGIN_NAME, createdAt: at };
    const steps = [
      () => tx.principals.add(principal),
      () => tx.principals.grantInstallationOwner(principalId.value, at),
      () => tx.principals.bindOperator(principalId.value),
      () => this.#audit(tx, 'access.owner-created', principalId.value, invocation, at),
    ];
    for (const step of steps) {
      const done = await step();
      if (!done.ok) return done;
    }
    return ok({ principalId: principalId.value, created: true });
  }

  async #existingOwner(
    tx: AccessTransaction, conflict: Result<BootstrappedOwner>, invocation: AdministrativeInvocation,
  ): Promise<Result<BootstrappedOwner>> {
    const bound = await tx.principals.operatorPrincipal();
    if (!bound.ok) return bound;
    return bound.value === undefined ? conflict : this.#repeated(tx, bound.value, invocation);
  }

  async #repeated(tx: AccessTransaction, owner: PrincipalId, invocation: AdministrativeInvocation): Promise<Result<BootstrappedOwner>> {
    const audited = await this.#audit(tx, 'access.owner-bootstrap-repeated', owner, invocation, this.#deps.clock.now());
    return audited.ok ? ok({ principalId: owner, created: false }) : audited;
  }

  #audit(
    tx: AccessTransaction, kind: OwnerAuditKind, owner: PrincipalId | undefined, invocation: AdministrativeInvocation, at: Instant,
  ): Promise<Result<void>> {
    return tx.audit.append({
      kind, ...(owner === undefined ? {} : { principalId: owner }), role: INSTALLATION_OWNER,
      actor: invocation.actor, reason: invocation.reason, occurredAt: at,
    });
  }
}

type OwnerAuditKind = 'access.owner-created' | 'access.owner-bootstrap-repeated' | 'access.owner-bootstrap-refused';
