import { failure, type Failure } from '@taskelith/kernel';
import { INSTALLATION_OWNER, type ProjectRole, type Role } from './roles.js';

// Whether an installation-owner passes a project requirement: never, for a
// read that section 3 lists, or by the temporary G2 bridge (Q5).
export type OwnerPass = 'never' | 'section-3-read' | 'g2-bridge';

// What an operation needs from its caller (wire contracts section 3). A
// project requirement without a project names a resource that is unknown.
export type AccessRequirement =
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'installation-owner' }
  | {
    readonly kind: 'project';
    readonly projectId: string | undefined;
    readonly role: ProjectRole;
    readonly ownerPass: OwnerPass;
  };

export const AUTHENTICATED: AccessRequirement = Object.freeze({ kind: 'authenticated' });
export const OWNER_ONLY: AccessRequirement = Object.freeze({ kind: 'installation-owner' });

export function projectRequirement(projectId: string | undefined, role: ProjectRole): AccessRequirement {
  return Object.freeze({ kind: 'project', projectId, role, ownerPass: 'never' });
}

// `project-viewer` or above, or installation-owner (section 3 reads).
export function projectRead(projectId: string | undefined): AccessRequirement {
  return Object.freeze({ kind: 'project', projectId, role: 'project-viewer', ownerPass: 'section-3-read' });
}

// TEMPORARY G2 bridge (Q5): the owner also passes the project requirements
// of the G2 operator operations until item 11 lands projects and members.
export function g2BridgeRequirement(projectId: string | undefined, role: ProjectRole): AccessRequirement {
  return Object.freeze({ kind: 'project', projectId, role, ownerPass: 'g2-bridge' });
}

// The role a denial names: the SPA shows "Needs <role>" from it (Q10).
export function requiredRoleOf(requirement: AccessRequirement): Role | undefined {
  if (requirement.kind === 'authenticated') return undefined;
  return requirement.kind === 'installation-owner' ? INSTALLATION_OWNER : requirement.role;
}

export function roleDenial(role: Role): Failure {
  return failure('forbidden', `the operation requires the role ${role}`, { reason: 'role-required', requiredRole: role });
}
