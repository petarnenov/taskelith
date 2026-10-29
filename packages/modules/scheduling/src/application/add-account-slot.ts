import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import {
  FIRST_SLOT_REVISION,
  parseAccountSlot,
  parseSlotCredentialVersion,
  type AccountSlot,
  type SlotCredentialVersion,
  type SubscriptionMechanismId,
} from '../domain/account-slot.js';
import { DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY } from '../domain/capacity-limits.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotSecret } from '../domain/slot-secret.js';
import type { AdmittedDeliveries, AdmittedDelivery, SlotCredentials } from '../ports/account-pool.js';
import type { CapacityStore, CapacityTransaction } from '../ports/capacity-store.js';
import { SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS } from './sweep-slot-credentials.js';

// Pool section 6.2: half the sweep's least grace age, from the store to the
// end of the add transaction, so the sweep never meets a live add's version.
export const ADD_SLOT_DEADLINE_MILLISECONDS = SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS / 2;

// What an installation owner sends; Access checked the role before.
export interface AddAccountSlotInput {
  readonly id: ProviderCredentialId;
  readonly harnessId: HarnessPluginId;
  readonly mechanismId: SubscriptionMechanismId;
  readonly allowedProjects: readonly ProjectId[];
  readonly concurrencyLimit?: number;
  readonly secret: SlotSecret;
}

export interface AccountSlotCommandPorts {
  readonly store: CapacityStore;
  readonly credentials: SlotCredentials;
  readonly deliveries: AdmittedDeliveries;
  // Milliseconds on the process's monotonic clock, for the add deadline.
  readonly monotonicMilliseconds: () => number;
}

// Pool sections 6.2 and 7.1: store, then add with the limit check; a version
// that may be committed is kept for the sweep of section 8.1.
export async function addAccountSlot(ports: AccountSlotCommandPorts, input: AddAccountSlotInput): Promise<Result<AccountSlot>> {
  const delivery = await ports.deliveries.find(input.harnessId, input.mechanismId);
  if (delivery === undefined) return err(notAdmitted(input));
  const draft = slotRecord(input, FIRST_CREDENTIAL_VERSION);
  if (!draft.ok) return draft;
  const deadline = ports.monotonicMilliseconds() + ADD_SLOT_DEADLINE_MILLISECONDS;
  const version = await ports.credentials.store(input.id, input.secret);
  const added = await ports.store.transaction(async (tx) => {
    const slot = await addWithinLimit(tx, slotRecord(input, version), delivery);
    return slot.ok && ports.monotonicMilliseconds() > deadline ? err(deadlineExceeded(input.id)) : slot;
  });
  if (!added.ok && !mayHaveCommitted(added.error)) await discardUnlessUnreachable(ports.credentials, input.id, version);
  return added;
}

function mayHaveCommitted(failed: Failure): boolean {
  return failed.code === 'unavailable' && failed.details.outcome === 'unknown';
}

// A version that cannot be discarded now is left for the sweep of section
// 8.1, so the add still returns its own refusal.
async function discardUnlessUnreachable(credentials: SlotCredentials, slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
  try {
    await credentials.discard(slotId, version);
  } catch {
    return;
  }
}

const FIRST_CREDENTIAL_VERSION = mustVersion(1);

async function addWithinLimit(tx: CapacityTransaction, slot: Result<AccountSlot>, delivery: AdmittedDelivery): Promise<Result<AccountSlot>> {
  if (!slot.ok) return slot;
  const { harnessId } = slot.value;
  if (delivery.slotLimit !== undefined && await tx.accountSlots.countNotRemoved(harnessId) >= delivery.slotLimit) {
    return err(failure('invalid', `harness ${harnessId} already has its ${delivery.slotLimit} allowed slots`, {
      harness: harnessId, slotLimit: String(delivery.slotLimit),
    }));
  }
  const added = await tx.accountSlots.add(slot.value);
  return added.ok ? ok(slot.value) : added;
}

function slotRecord(input: AddAccountSlotInput, credentialVersion: SlotCredentialVersion): Result<AccountSlot> {
  const { id, harnessId, mechanismId, allowedProjects } = input;
  return parseAccountSlot({
    id, harnessId, mechanismId, credentialVersion, allowedProjects,
    concurrencyLimit: input.concurrencyLimit ?? DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
    state: 'active', health: 'healthy', revision: FIRST_SLOT_REVISION,
  });
}

// Retryable: the transaction rolled back and the version is discarded.
function deadlineExceeded(id: ProviderCredentialId) {
  return failure('unavailable', `the add of slot ${id} passed its deadline`, { slot: id, reason: 'add-deadline-exceeded' });
}

// Names identifiers only, never the credential (contract section 2, rule 5).
function notAdmitted({ harnessId, mechanismId }: AddAccountSlotInput) {
  return failure('invalid', `mechanism ${mechanismId} has no admitted delivery for harness ${harnessId}`, {
    harness: harnessId, mechanism: mechanismId,
  });
}

function mustVersion(value: number): SlotCredentialVersion {
  const version = parseSlotCredentialVersion(value);
  if (!version.ok) throw new Error(version.error.message);
  return version.value;
}
