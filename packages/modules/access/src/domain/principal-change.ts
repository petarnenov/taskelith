import type { PrincipalId } from './principal.js';

// A change of a principal's access that ends its event streams (wire
// contracts section 10); without `projectId`, of its installation role.
export type PrincipalChange =
  | { readonly change: 'roles-changed'; readonly principalId: PrincipalId; readonly projectId?: string }
  | { readonly change: 'sessions-ended'; readonly principalId: PrincipalId };

export function rolesChanged(principalId: PrincipalId, projectId?: string): PrincipalChange {
  return Object.freeze({ change: 'roles-changed', principalId, ...(projectId === undefined ? {} : { projectId }) });
}

export function sessionsEnded(principalId: PrincipalId): PrincipalChange {
  return Object.freeze({ change: 'sessions-ended', principalId });
}
