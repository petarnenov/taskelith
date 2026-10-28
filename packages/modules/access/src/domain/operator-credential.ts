import type { Instant } from '@taskelith/kernel';
import type { SecretHash } from './secret-hash.js';

// The installation-owner credential: one current generation, replaced only
// by bootstrap (generation 1) or by an audited reset (trust model 2).
export interface OperatorCredential {
  readonly generation: number;
  readonly hash: SecretHash;
  readonly issuedAt: Instant;
}

export type AuditEventKind =
  | 'operator-credential.bootstrapped'
  | 'operator-credential.reset'
  | 'worker-credential.rotation-requested'
  | 'worker-credential.renewed'
  | 'worker-credential.confirmed'
  | 'worker-credential.rotation-expired';

// The subject of the operator credential's events; a worker's events name
// the worker identifier.
export const OPERATOR_AUDIT_SUBJECT = 'operator';

// An immutable record of who changed a credential, from where, and why.
export interface AuditEvent {
  readonly kind: AuditEventKind;
  readonly subject: string;
  readonly generation: number;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Instant;
}

export const AUDIT_TEXT_MAX_LENGTH = 512;
