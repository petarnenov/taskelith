import type { Result } from '@taskelith/kernel';
import type { AuditEvent, OperatorCredential } from '../domain/operator-credential.js';

// The current operator credential and its append-only audit trail. `install`
// writes both or neither: `conflict` unless `next` is the next generation.
export interface OperatorCredentials {
  current(): Promise<Result<OperatorCredential | undefined>>;
  install(next: OperatorCredential, event: AuditEvent): Promise<Result<void>>;
  auditTrail(): Promise<Result<readonly AuditEvent[]>>;
}
