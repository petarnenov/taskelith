import type { Result } from '@taskelith/kernel';
import type { AuditEvent, OperatorCredential } from '../domain/operator-credential.js';

// Stores the current operator credential with its append-only audit trail.
// `install` writes both or neither, and fails with `conflict` unless `next`
// is the generation after the current one, or 1 when there is none.
export interface OperatorCredentials {
  current(): Promise<Result<OperatorCredential | undefined>>;
  install(next: OperatorCredential, event: AuditEvent): Promise<Result<void>>;
  auditTrail(): Promise<Result<readonly AuditEvent[]>>;
}
