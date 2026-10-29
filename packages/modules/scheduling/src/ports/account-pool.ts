import type { HarnessPluginId } from '@taskelith/execution';
import type { Instant, Result } from '@taskelith/kernel';
import type { AccountSlot, SlotCredentialVersion, SubscriptionMechanismId } from '../domain/account-slot.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotSecret } from '../domain/slot-secret.js';

// Slot records, read and written inside the reservation transaction
// (account pool contract section 6.1).
export interface AccountSlots {
  // `conflict` for a known identifier, `invalid` for a revision other than 1.
  add(slot: AccountSlot): Promise<Result<void>>;
  get(id: ProviderCredentialId): Promise<Result<AccountSlot>>;
  // Active slots of the harness allowed for the project, by code point of id.
  pool(projectId: ProjectId, harnessId: HarnessPluginId): Promise<readonly AccountSlot[]>;
  // Compare-and-set: `not-found`, then `invalid` for a bad revision step,
  // harness change, or slot leaving removed, then `conflict` (section 6.1).
  replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>>;
  // Slots of the harness in any project that are not removed, for the slot
  // limit of an admitted pair (contract section 7.1).
  countNotRemoved(harnessId: HarnessPluginId): Promise<number>;
}

// Contract section 7.1: the one delivery this contract defines.
export const SLOT_DELIVERIES = Object.freeze(['subscription-token'] as const);

export type SlotDelivery = (typeof SLOT_DELIVERIES)[number];

// An admitted pair of harness plugin and mechanism, with its optional limit
// on the harness's slots that are not removed.
export interface AdmittedDelivery {
  readonly delivery: SlotDelivery;
  readonly slotLimit?: number;
}

// The admitted pairs, kept by the control plane outside the pool, which
// reads them and never the plugin (contract section 7.1).
export interface AdmittedDeliveries {
  find(harnessId: HarnessPluginId, mechanismId: SubscriptionMechanismId): Promise<AdmittedDelivery | undefined>;
}

// One stored version of a slot's credential, as the sweep lists it.
export interface StoredSlotCredential {
  readonly slotId: ProviderCredentialId;
  readonly version: SlotCredentialVersion;
}

// Subscription tokens, encrypted with a key in the control-plane/ namespace;
// not part of CapacityTransaction (contract sections 1, 6.2, and 7.1).
export interface SlotCredentials {
  // A new version from a stored per-slot counter, never reused; keeps
  // nothing after destroy (section 6.2), but still returns a version.
  store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<SlotCredentialVersion>;
  // Checks nothing: the delivery checks the reservation first (section 7).
  reveal(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<Result<SlotSecret>>;
  // One version; succeeds for a missing one, so that a retry is safe.
  discard(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void>;
  // Only the slot's versions lower than `version`, after a rotation's switch
  // (section 8.1); keeps it and higher ones, so that a retry is safe.
  discardOlderThan(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void>;
  // Every version and every later store; succeeds for a missing credential.
  destroy(slotId: ProviderCredentialId): Promise<void>;
  // Versions stored before the instant, by slot id code units, then by
  // version, for the sweep of section 8.1 (section 6.2).
  listStored(storedBefore: Instant): Promise<readonly StoredSlotCredential[]>;
}
