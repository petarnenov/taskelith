import type { Instant } from '@taskelith/kernel';
import type { SecretHash } from './secret-hash.js';

// The installation-owner credential: one current generation, replaced only
// by bootstrap (generation 1) or by an audited reset (trust model 2).
export interface OperatorCredential {
  readonly generation: number;
  readonly hash: SecretHash;
  readonly issuedAt: Instant;
}

export type AuditEventKind = 'operator-credential.bootstrapped' | 'operator-credential.reset';

// An immutable record of who changed the credential, from where, and why.
export interface AuditEvent {
  readonly kind: AuditEventKind;
  readonly generation: number;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Instant;
}

export const AUDIT_TEXT_MAX_LENGTH = 512;
