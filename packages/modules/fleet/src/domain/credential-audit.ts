import type { AuditEvent } from '@taskelith/access';
import type { Instant } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';

// Who acts in a worker's credential events other than the operator.
export const WORKER_ACTOR = 'worker';
export const CONTROL_PLANE_ACTOR = 'control-plane';

// Why a rotation ended at its deadline: the worker never renewed it, or
// renewed it without a confirmation.
export type RotationExpiry = 'rotation-expired' | 'unconfirmed';

export interface CredentialEventFacts {
  readonly workerId: WorkerId;
  readonly generation: number;
  readonly actor: string;
  readonly reason: string;
  readonly occurredAt: Instant;
}

// An audit event of a worker's credentials; the worker is its subject.
export function credentialEvent(kind: AuditEvent['kind'], facts: CredentialEventFacts): AuditEvent {
  const { workerId, generation, actor, reason, occurredAt } = facts;
  return Object.freeze({ kind, subject: workerId, generation, actor, reason, occurredAt });
}

export function expiryEvent(workerId: WorkerId, generation: number, reason: RotationExpiry, occurredAt: Instant): AuditEvent {
  return credentialEvent('worker-credential.rotation-expired', { workerId, generation, actor: CONTROL_PLANE_ACTOR, reason, occurredAt });
}
