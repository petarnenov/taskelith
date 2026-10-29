import type { AttemptId, ExecutionId, RecoveryEpoch, SlotCredentialRefusal, Task } from '@taskelith/execution';
import type { WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import {
  checkDeliveredSlot,
  checkSlotDeliveryOwnership,
  nextDeliveryRecord,
  type AccountSlot,
  type AdmittedDeliveries,
  type ProviderCredentialId,
  type SlotCredentials,
  type SlotDeliveryRequest,
  type SlotSecret,
} from '@taskelith/scheduling';
import type { OwnershipGeneration } from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { installationState, isCurrentWorker } from './launch-authority.js';

// What a worker names in `fetchSlotCredential`, besides its own identity.
export interface SlotCredentialFetchRequest {
  readonly executionId: ExecutionId;
  readonly slotId: ProviderCredentialId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly recoveryEpoch: RecoveryEpoch;
}

// A revealed credential, which only the API response carries.
export interface RevealedSlotDelivery {
  readonly executionId: ExecutionId;
  readonly slotId: ProviderCredentialId;
  readonly mechanismId: string;
  readonly credentialVersion: number;
  readonly credential: SlotSecret;
}

export interface SlotCredentialDeliveryPorts {
  readonly credentials: SlotCredentials;
  readonly admittedDeliveries: AdmittedDeliveries;
}

// Account pool contract section 7: one SERIALIZABLE transaction checks and
// records the delivery, and the credential is revealed only after it.
export class SlotCredentialDeliveryService {
  readonly #store: ControlPlaneStore;
  readonly #ports: SlotCredentialDeliveryPorts;

  constructor(store: ControlPlaneStore, ports: SlotCredentialDeliveryPorts) {
    this.#store = store;
    this.#ports = ports;
  }

  async fetch(principal: WorkerPrincipal, values: SlotCredentialFetchRequest): Promise<Result<RevealedSlotDelivery>> {
    const request: SlotDeliveryRequest = Object.freeze({ ...values, workerId: principal.workerId });
    const checked = await this.#store.transaction((tx) => this.#checkAndRecord(tx, principal, request));
    if (!checked.ok) return checked;
    const slot = checked.value;
    const revealed = await this.#reveal(slot);
    if (!revealed.ok) return revealed;
    const { executionId, slotId } = request;
    return ok(Object.freeze({
      executionId, slotId, mechanismId: slot.mechanismId, credentialVersion: slot.credentialVersion, credential: revealed.value,
    }));
  }

  async #checkAndRecord(tx: ControlPlaneTransaction, principal: WorkerPrincipal, request: SlotDeliveryRequest): Promise<Result<AccountSlot>> {
    const installation = await installationState(tx);
    if (!installation.ok) return installation;
    const workerAuthorized = await isCurrentWorker(tx, principal);
    if (!workerAuthorized.ok) return workerAuthorized;
    const assignment = (await tx.assignments.listByAttempt(request.attemptId))
      .find((candidate) => candidate.workerId === request.workerId && candidate.state !== 'ended');
    const task = assignment === undefined ? undefined : await taskOf(tx, assignment.reservation.scope.taskId);
    if (task !== undefined && !task.ok) return task;
    const stored = task?.value;
    const earlierDelivery = stored === undefined
      ? undefined : await tx.slotCredentialDeliveries.find(stored.id, request.executionId, request.slotId);
    const now = await tx.now();
    const context = { installation: installation.value, workerAuthorized: workerAuthorized.value, now };
    const refused = checkSlotDeliveryOwnership(request, {
      ...context,
      ...(assignment === undefined ? {} : { assignment }),
      ...(stored === undefined ? {} : { task: stored }),
      ...(earlierDelivery === undefined ? {} : { earlierDelivery }),
    });
    if (refused !== undefined) return err(refusalFailure(refused));
    if (stored === undefined) return err(failure('internal', 'the ownership checks passed without a task'));
    const slot = await this.#deliverableSlot(tx, request.slotId);
    if (!slot.ok) return slot;
    if (earlierDelivery !== undefined && earlierDelivery.credentialVersion !== slot.value.credentialVersion) {
      return err(failure('internal', `slot ${request.slotId} names another credential version than its earlier delivery`, {
        slot: request.slotId,
      }));
    }
    const { executionId, slotId, attemptId, workerId } = request;
    const delivery = { taskId: stored.id, executionId, slotId, attemptId, workerId, credentialVersion: slot.value.credentialVersion };
    await tx.slotCredentialDeliveries.record(nextDeliveryRecord(earlierDelivery, delivery, now));
    return slot;
  }

  // The slot that the reservation names, active and with an admitted delivery.
  async #deliverableSlot(tx: ControlPlaneTransaction, slotId: ProviderCredentialId): Promise<Result<AccountSlot>> {
    const slot = await tx.accountSlots.get(slotId);
    if (!slot.ok) {
      return slot.error.code === 'not-found'
        ? err(failure('internal', `the reservation names slot ${slotId}, which is not stored`, { slot: slotId })) : slot;
    }
    const admitted = await this.#ports.admittedDeliveries.find(slot.value.harnessId, slot.value.mechanismId);
    const refused = checkDeliveredSlot(slot.value, admitted !== undefined);
    return refused === undefined ? slot : err(refusalFailure(refused));
  }

  // Every failure gets a local message with the slot only, as an adapter's
  // diagnostic may hold the credential.
  async #reveal(slot: AccountSlot): Promise<Result<SlotSecret>> {
    try {
      const revealed = await this.#ports.credentials.reveal(slot.id, slot.credentialVersion);
      return revealed.ok ? revealed : err(revealFailure(slot, revealed.error));
    } catch {
      return err(failure('unavailable', `the credential of slot ${slot.id} cannot be read`, { slot: slot.id }));
    }
  }
}

async function taskOf(tx: ControlPlaneTransaction, taskId: Task['id']): Promise<Result<Task> | undefined> {
  const task = await tx.tasks.get(taskId);
  return !task.ok && task.error.code === 'not-found' ? undefined : task;
}

function revealFailure(slot: AccountSlot, refused: Failure): Failure {
  const details = { slot: slot.id };
  if (refused.code === 'not-found') return failure('internal', `the credential version of slot ${slot.id} is not stored`, details);
  if (refused.code === 'unavailable') return failure('unavailable', `the credential of slot ${slot.id} cannot be read`, details);
  return failure('internal', `the credential of slot ${slot.id} cannot be revealed`, details);
}

// The wire's typed refusal: 422 with the reason (wire contracts section 8.6).
function refusalFailure({ reason, message }: SlotCredentialRefusal): Failure {
  return failure('precondition-failed', message, { reason });
}
