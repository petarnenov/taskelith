import type { AuditEvent } from '@taskelith/access';
import { err, failure, ok, type Failure, type Instant, type Result } from '@taskelith/kernel';
import { credentialEvent, expiryEvent, WORKER_ACTOR } from './credential-audit.js';
import {
  confirmCredentials,
  credentialGenerations,
  expiredPredecessor,
  renewCredentials,
  requestRotation,
  revocationOf,
  unrenewedPastDeadline,
  type BrokerRevocation,
  type CredentialGeneration,
  type EnrolledWorker,
  type RotationConflict,
  type RotationRequest,
} from './enrollment.js';

// One registry write of a rotation step, which every registry applies in
// one transaction: the new record, its revocations, and its audit event.
export interface RotationStep {
  readonly worker: EnrolledWorker;
  readonly revocations: readonly BrokerRevocation[];
  readonly event?: AuditEvent;
}

export interface RotationOrderFacts {
  readonly requestedAt: Instant;
  readonly deadline: Instant;
  readonly actor: string;
  readonly reason: string;
}

// A new request is audited; an open one is answered unchanged.
export function requestStep(worker: EnrolledWorker, order: RotationOrderFacts): RotationStep & { readonly request: RotationRequest } {
  const credentials = requestRotation(worker.credentials, order.requestedAt, order.deadline);
  const request = credentials.rotation!;
  if (credentials === worker.credentials) return { worker, revocations: [], request };
  const event = credentialEvent('worker-credential.rotation-requested', {
    workerId: worker.workerId, generation: request.generation, actor: order.actor, reason: order.reason, occurredAt: order.requestedAt,
  });
  return { worker: Object.freeze({ ...worker, credentials }), revocations: [], event, request };
}

export function renewalStep(
  worker: EnrolledWorker,
  next: CredentialGeneration,
  brokerUserJwt: string,
  at: Instant,
): Result<RotationStep & { readonly request: RotationRequest }> {
  if (unrenewedPastDeadline(worker.credentials, at)) return err(lateRenewal());
  const renewed = renewCredentials(worker.credentials, next, brokerUserJwt);
  if (!renewed.ok) return err(rotationConflict(renewed.error));
  const request = renewed.value.rotation!;
  if (renewed.value === worker.credentials) return ok({ worker, revocations: [], request });
  const event = credentialEvent('worker-credential.renewed', {
    workerId: worker.workerId, generation: next.generation, actor: WORKER_ACTOR, reason: 'renewed', occurredAt: at,
  });
  return ok({ worker: Object.freeze({ ...worker, credentials: renewed.value }), revocations: [], event, request });
}

// Past the deadline the predecessor expires first, as the sweep would
// drop it, and the confirmation is then a repeat.
export function confirmationStep(worker: EnrolledWorker, generation: number, at: Instant): Result<RotationStep & { readonly dropped: boolean }> {
  const expiry = predecessorExpiryStep(worker, at);
  const confirmed = confirmCredentials((expiry?.worker ?? worker).credentials, generation);
  if (!confirmed.ok) return err(rotationConflict(confirmed.error));
  if (expiry !== undefined) return ok({ ...expiry, dropped: true });
  const { dropped, credentials } = confirmed.value;
  if (dropped === undefined) return ok({ worker, revocations: [], dropped: false });
  const event = credentialEvent('worker-credential.confirmed', {
    workerId: worker.workerId, generation, actor: WORKER_ACTOR, reason: 'confirmed', occurredAt: at,
  });
  return ok({ worker: Object.freeze({ ...worker, credentials }), revocations: [revocationOf(dropped, at)], event, dropped: true });
}

// The predecessor of an unconfirmed renewal, dropped at the deadline from
// the deadline on; the renewed generation stays.
export function predecessorExpiryStep(worker: EnrolledWorker, now: Instant): RotationStep | undefined {
  const previous = expiredPredecessor(worker.credentials, now);
  if (previous === undefined) return undefined;
  const { current } = worker.credentials;
  const event = expiryEvent(worker.workerId, current.generation, 'unconfirmed', now);
  const credentials = Object.freeze({ current });
  return { worker: Object.freeze({ ...worker, credentials }), revocations: [revocationOf(previous, previous.validUntil)], event };
}

// A rotation never renewed by its deadline revokes the worker.
export function rotationExpiryStep(worker: EnrolledWorker, now: Instant): RotationStep | undefined {
  if (worker.revokedAt !== undefined || !unrenewedPastDeadline(worker.credentials, now)) return undefined;
  const generation = worker.credentials.rotation!.generation;
  const revocations = credentialGenerations(worker.credentials).map((stored) => revocationOf(stored, now));
  return { worker: Object.freeze({ ...worker, revokedAt: now }), revocations, event: expiryEvent(worker.workerId, generation, 'rotation-expired', now) };
}

const CONFLICT_MESSAGES: Readonly<Record<RotationConflict, string>> = Object.freeze({
  'rotation-not-requested': 'no rotation to this generation is open for the worker',
  'renewal-mismatch': 'the generation was renewed with another key or secret',
  'confirmation-mismatch': 'the generation is not the renewed or current one of this bearer',
});

// The sweep revokes such a worker; until then its bearer renews nothing.
function lateRenewal(): Failure {
  return failure('forbidden', 'the rotation passed its deadline before it was renewed', { reason: 'rotation-expired' });
}

export function rotationConflict(reason: RotationConflict): Failure {
  return failure('conflict', CONFLICT_MESSAGES[reason], { reason });
}
