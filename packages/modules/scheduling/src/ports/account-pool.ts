import type { HarnessPluginId } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import type { AccountSlot } from '../domain/account-slot.js';
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
}

// Subscription tokens, encrypted with a key in the control-plane/ namespace;
// not part of CapacityTransaction (contract sections 1, 6.2, and 7.1).
export interface SlotCredentials {
  // A rotation runs only on a revoked, unreserved slot (section 8.1).
  store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<void>;
  // Checks nothing: the delivery checks the reservation first (section 7).
  reveal(slotId: ProviderCredentialId): Promise<Result<SlotSecret>>;
  // Succeeds for a missing credential, so that a retry is safe.
  destroy(slotId: ProviderCredentialId): Promise<void>;
}
