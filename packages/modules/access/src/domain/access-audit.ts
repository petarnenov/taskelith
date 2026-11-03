import type { Instant } from '@taskelith/kernel';
import type { PrincipalId } from './principal.js';
import type { Role } from './roles.js';

export type AccessAuditKind =
  | 'access.owner-created'
  | 'access.owner-bootstrap-repeated'
  | 'access.owner-bootstrap-refused'
  | 'access.principal-created'
  | 'access.password-set'
  | 'access.project-role-assigned'
  | 'access.project-role-removed'
  | 'access.project-created'
  | 'access.project-renamed'
  | 'access.project-defaults-changed';

// Names principals, roles, actors, and reasons; never a password, hash,
// session identifier, or CSRF token (decision 12).
export interface AccessAuditEvent {
  readonly kind: AccessAuditKind;
  // Absent on a refused bootstrap of an installation with no owner and on
  // a project event, which names its project.
  readonly principalId?: PrincipalId;
  readonly projectId?: string;
  readonly role?: Role;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Instant;
}
