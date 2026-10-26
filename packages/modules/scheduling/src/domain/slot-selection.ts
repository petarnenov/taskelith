import type { Instant } from '@taskelith/kernel';
import type { HarnessPluginId } from './account-slot.js';
import type { WaitingReason } from './capacity-reasons.js';
import type { ProjectId, ProviderCredentialId } from './capacity-reservation.js';

export const SLOT_REQUEST_KINDS = Object.freeze(['new-session', 'resumed-session', 'after-limit'] as const);
export const NO_SLOT_POLICIES = Object.freeze(['wait', 'reject'] as const);
export const SLOT_WAITING_REASON = 'provider-concurrency-exhausted' satisfies WaitingReason;
export const SLOT_REJECTING_REASONS = Object.freeze(['no-eligible-slot', 'session-slot-withdrawn'] as const);

export type SlotRequestKind = (typeof SLOT_REQUEST_KINDS)[number];
export type NoSlotPolicy = (typeof NO_SLOT_POLICIES)[number];
export type SlotRejectingReason = (typeof SLOT_REJECTING_REASONS)[number];

export interface HarnessSlot {
  readonly harness: HarnessPluginId;
  readonly slotId: ProviderCredentialId;
}

// Contract section 4.1; `alternatives` keeps the project's preference order.
export type SlotRequest = { readonly projectId: ProjectId } & (
  | { readonly kind: 'new-session'; readonly harness: HarnessPluginId; readonly whenNoSlot: NoSlotPolicy }
  | { readonly kind: 'resumed-session'; readonly pinned: HarnessSlot }
  | { readonly kind: 'after-limit'; readonly limited: HarnessSlot; readonly alternatives: readonly HarnessPluginId[] }
);

// Contract section 4.6; a waiting or rejected selection changes no slot.
export type SlotSelection =
  | { readonly outcome: 'reserved'; readonly slot: HarnessSlot }
  | { readonly outcome: 'waiting'; readonly reason: typeof SLOT_WAITING_REASON; readonly earliestCooldownEnd?: Instant }
  | { readonly outcome: 'rejected'; readonly reason: SlotRejectingReason };
