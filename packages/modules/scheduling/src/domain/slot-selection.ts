import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
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
  readonly harnessId: HarnessPluginId;
  readonly slotId: ProviderCredentialId;
}

// Contract section 4.1; `alternatives` keeps the project's preference order.
export type SlotRequest = { readonly projectId: ProjectId } & (
  | { readonly kind: 'new-session'; readonly harnessId: HarnessPluginId; readonly whenNoSlot: NoSlotPolicy }
  | { readonly kind: 'resumed-session'; readonly pinned: HarnessSlot }
  | { readonly kind: 'after-limit'; readonly limited: HarnessSlot; readonly alternatives: readonly HarnessPluginId[] }
);

// Contract section 4.6; a waiting or rejected selection changes no slot.
export type SlotSelection =
  | { readonly outcome: 'reserved'; readonly slot: HarnessSlot }
  | { readonly outcome: 'waiting'; readonly reason: typeof SLOT_WAITING_REASON; readonly earliestCooldownEnd?: Instant }
  | { readonly outcome: 'rejected'; readonly reason: SlotRejectingReason };

// The request invariants of contract section 4.1; whether a pinned or
// limited harness matches the stored slot needs the store (item 12).
export function parseSlotRequest(request: SlotRequest): Result<SlotRequest> {
  if (request.kind !== 'after-limit') return ok(request);
  const { limited, alternatives } = request;
  if (alternatives.includes(limited.harnessId)) return err(failure('invalid', 'the limited harness is an alternative'));
  if (new Set(alternatives).size !== alternatives.length) return err(failure('invalid', 'a harness is an alternative twice'));
  return ok(Object.freeze({ ...request, alternatives: Object.freeze([...alternatives]) }));
}
