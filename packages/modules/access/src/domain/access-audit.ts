import type { Instant } from '@taskelith/kernel';
import type { PrincipalId } from './principal.js';
import type { Role } from './roles.js';

export type AccessAuditKind =
  | 'access.owner-created'
  | 'access.principal-created'
  | 'access.password-set'
  | 'access.project-role-assigned'
  | 'access.project-role-removed';

// Names principals, roles, actors, and reasons; never a password, hash,
// session identifier, or CSRF token (decision 12).
export interface AccessAuditEvent {
  readonly kind: AccessAuditKind;
  readonly principalId: PrincipalId;
  readonly projectId?: string;
  readonly role?: Role;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Instant;
}
