import {
  isGrantExpired,
  isTerminalExecution,
  owningExecution,
  type AttemptId,
  type Execution,
  type ExecutionId,
  type InstallationState,
  type RecoveryEpoch,
  type SlotCredentialRefusal,
  type SlotCredentialRefusalReason,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import type { Instant } from '@taskelith/kernel';
import type { OwnershipGeneration, TaskId } from '@taskelith/sdlc';
import type { AccountSlot, SlotCredentialVersion } from './account-slot.js';
import type { Assignment } from './assignment.js';
import type { ProviderCredentialId } from './capacity-reservation.js';

// A worker's delivery request; the worker is the authenticated principal.
export interface SlotDeliveryRequest {
  readonly workerId: WorkerId;
  readonly recoveryEpoch: RecoveryEpoch;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly executionId: ExecutionId;
  readonly slotId: ProviderCredentialId;
}

// A delivery that revealed a slot credential to an execution, and never
// the credential itself; 13c redacts the run by the versions it names.
export interface SlotDeliveryRecord {
  readonly taskId: TaskId;
  readonly executionId: ExecutionId;
  readonly slotId: ProviderCredentialId;
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
  readonly credentialVersion: SlotCredentialVersion;
  readonly firstDeliveredAt: Instant;
  readonly lastDeliveredAt: Instant;
  readonly deliveries: number;
}

// What the ownership checks read in the delivery transaction; the
// assignment is the worker's own unended one of the attempt, if any.
export interface SlotDeliveryOwnership {
  readonly installation: InstallationState;
  readonly workerAuthorized: boolean;
  readonly assignment?: Assignment;
  readonly task?: Task;
  readonly earlierDelivery?: SlotDeliveryRecord;
  readonly now: Instant;
}

type Check = SlotCredentialRefusal | undefined;

// Account pool contract section 7.3 up to the reservation, in its order;
// execution wire contracts section 8.6 adds the first fetch's grant check.
export function checkSlotDeliveryOwnership(request: SlotDeliveryRequest, context: SlotDeliveryOwnership): Check {
  return checkInstallation(request, context) ?? checkAssignment(request, context);
}

// The slot checks after the reservation: its state, then its delivery.
export function checkDeliveredSlot(slot: AccountSlot, admitted: boolean): Check {
  if (slot.state !== 'active') return refusal(slot.state, `slot ${slot.id} is ${slot.state}`);
  if (!admitted) return refusal('delivery-not-admitted', `slot ${slot.id} has no admitted delivery for its harness and mechanism`);
  return undefined;
}

// The record after this delivery: a first one, or one more of the same.
export function nextDeliveryRecord(
  earlier: SlotDeliveryRecord | undefined,
  delivery: Omit<SlotDeliveryRecord, 'firstDeliveredAt' | 'lastDeliveredAt' | 'deliveries'>,
  now: Instant,
): SlotDeliveryRecord {
  if (earlier === undefined) return Object.freeze({ ...delivery, firstDeliveredAt: now, lastDeliveredAt: now, deliveries: 1 });
  return Object.freeze({ ...earlier, attemptId: delivery.attemptId, workerId: delivery.workerId, lastDeliveredAt: now,
    deliveries: earlier.deliveries + 1 });
}

function checkInstallation(request: SlotDeliveryRequest, context: SlotDeliveryOwnership): Check {
  if (context.installation.quarantined) return refusal('quarantined', 'the installation is in restore quarantine');
  if (request.recoveryEpoch !== context.installation.recoveryEpoch) {
    return refusal('stale-recovery-epoch', `recovery epoch ${request.recoveryEpoch} is not current`);
  }
  if (!context.workerAuthorized) return refusal('worker-not-authorized', `worker ${request.workerId} is not authorized`);
  return undefined;
}

function checkAssignment(request: SlotDeliveryRequest, context: SlotDeliveryOwnership): Check {
  const { assignment, task } = context;
  const attempt = task?.attempts.find((candidate) => candidate.id === request.attemptId);
  const execution = attempt?.executions.find((candidate) => candidate.id === request.executionId);
  if (
    assignment === undefined || task === undefined || attempt === undefined || execution === undefined
    || assignment.state === 'ended' || assignment.workerId !== request.workerId || assignment.attemptId !== request.attemptId
    || execution.assignmentId !== assignment.id || execution.workerId !== request.workerId
  ) {
    return refusal('assignment-not-active', `attempt ${request.attemptId} has no active execution ${request.executionId} of this worker`);
  }
  const current = task.ownershipGeneration;
  if (request.ownershipGeneration !== current || assignment.ownershipGeneration !== current) {
    return refusal('stale-ownership-generation', `ownership generation ${request.ownershipGeneration} is not ${current}`);
  }
  if (attempt.outcome !== undefined || attempt.cancellation !== undefined) {
    return refusal('attempt-not-launchable', `attempt ${attempt.id} is cancelled or ended`);
  }
  return checkExecution(execution, owningExecution(attempt), context) ?? checkReservation(request, assignment);
}

// The owning execution, `authorized` or `started`, with no revoked grant;
// a first delivery to an `authorized` one also needs a live grant.
function checkExecution(execution: Execution, owning: Execution | undefined, context: SlotDeliveryOwnership): Check {
  const conflict = (why: string) => refusal('execution-conflict', `execution ${execution.id} ${why}`);
  if (owning?.id !== execution.id || isTerminalExecution(execution)) return conflict('is not the owning execution');
  if (execution.grants.some((grant) => grant.state === 'revoked')) return conflict('has a revoked grant');
  if (execution.state !== 'authorized' || context.earlierDelivery !== undefined) return undefined;
  const latest = execution.grants.at(-1);
  if (latest === undefined || isGrantExpired(latest, context.now)) return conflict('has no unexpired grant for a first delivery');
  return undefined;
}

function checkReservation(request: SlotDeliveryRequest, assignment: Assignment): Check {
  const { reservation } = assignment;
  if (reservation.state === 'held' && reservation.providerCredentials.includes(request.slotId)) return undefined;
  return refusal('capacity-not-reserved', `no held reservation of attempt ${request.attemptId} names slot ${request.slotId}`);
}

function refusal(reason: SlotCredentialRefusalReason, message: string): SlotCredentialRefusal {
  return Object.freeze({ reason, message });
}
