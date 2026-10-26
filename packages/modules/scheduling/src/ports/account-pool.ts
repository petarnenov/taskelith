import type { Result } from '@taskelith/kernel';
import type { AccountSlot, HarnessPluginId } from '../domain/account-slot.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotSecret } from '../domain/slot-secret.js';

// Slot records, read and written inside the reservation transaction
// (account pool contract section 6.1).
export interface AccountSlots {
  // `conflict` for a known identifier, `invalid` for a revision other than 1.
  add(slot: AccountSlot): Promise<Result<void>>;
  get(id: ProviderCredentialId): Promise<Result<AccountSlot>>;
  // The active slots of the harness allowed for the project, by identifier.
  pool(projectId: ProjectId, harness: HarnessPluginId): Promise<readonly AccountSlot[]>;
  // Compare-and-set; `invalid` for a harness change or a slot leaving removed.
  replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>>;
}

// Encrypted at rest with a key kept outside the slot store; the algorithm
// and key management belong to the implementing adapter (G3 item 12).
export interface SlotCredentials {
  store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<Result<void>>;
  // Only for delivery to the run that reserved the slot (contract section 7).
  reveal(slotId: ProviderCredentialId): Promise<Result<SlotSecret>>;
  // Succeeds for a missing credential, so that a retry is safe.
  destroy(slotId: ProviderCredentialId): Promise<Result<void>>;
}
