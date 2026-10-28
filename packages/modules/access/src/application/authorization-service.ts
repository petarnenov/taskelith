import { err, ok, type Result } from '@taskelith/kernel';
import type { PrincipalId } from '../domain/principal.js';
import { roleDenial, type AccessRequirement } from '../domain/requirement.js';
import { includesRole, INSTALLATION_OWNER } from '../domain/roles.js';
import type { AccessStore, AccessTransaction } from '../ports/access-store.js';

// Wire contracts section 3: the caller's role, read from the store on
// every request, checked before any other port is called.
export class AuthorizationService {
  readonly #store: AccessStore;

  constructor(store: AccessStore) {
    this.#store = store;
  }

  authorize(principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>> {
    return this.#store.transaction((tx) => authorizeIn(tx, principalId, requirement));
  }
}

// A denial names the required role and never whether the resource exists:
// a project requirement without a project is denied like a foreign one.
export async function authorizeIn(tx: AccessTransaction, principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>> {
  if (requirement.kind === 'authenticated') return ok(undefined);
  const owner = await tx.principals.isInstallationOwner(principalId);
  if (!owner.ok) return owner;
  if (requirement.kind === 'installation-owner') return owner.value ? ok(undefined) : err(roleDenial(INSTALLATION_OWNER));
  if (owner.value && requirement.ownerPass !== 'never') return ok(undefined);
  if (requirement.projectId === undefined) return err(roleDenial(requirement.role));
  const held = await tx.projectRoles.roleOf(requirement.projectId, principalId);
  if (!held.ok) return held;
  if (held.value !== undefined && includesRole(held.value, requirement.role)) return ok(undefined);
  return err(roleDenial(requirement.role));
}
