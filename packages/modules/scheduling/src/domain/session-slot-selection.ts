import type { Instant } from '@taskelith/kernel';
import type { SlotIneligibilityReason } from './account-slot.js';
import type { ProjectId } from './capacity-reservation.js';
import {
  earliestCooldownEnd,
  eligibleStandings,
  leastLoaded,
  reservedSlot,
  slotIneligibility,
  slotWait,
  type SlotStanding,
} from './least-loaded-selection.js';
import type { SlotSelection } from './slot-selection.js';

// Reasons that end a session's claim on its slot (contract section 4.3).
const WITHDRAWN_REASONS: readonly SlotIneligibilityReason[] = Object.freeze(['removed', 'revoked', 'not-allowed']);

export interface ResumedSessionSlot {
  readonly projectId: ProjectId;
  readonly own: SlotStanding;
}

// The alternatives' pools keep the project's order of preference.
export interface AfterLimitPools {
  readonly projectId: ProjectId;
  readonly limited: SlotStanding;
  readonly alternatives: readonly (readonly SlotStanding[])[];
}

// Contract section 4.3: the session's own slot or nothing, never a move.
export function selectResumedSessionSlot({ projectId, own }: ResumedSessionSlot, now: Instant): SlotSelection {
  const reason = slotIneligibility(own, projectId, now);
  if (reason === undefined) return reservedSlot(own.slot);
  if (WITHDRAWN_REASONS.includes(reason)) return Object.freeze({ outcome: 'rejected', reason: 'session-slot-withdrawn' });
  return slotWait(earliestCooldownEnd([own], projectId, now));
}

// Contract section 4.4: another harness in order, then the limited slot;
// no other slot of the limited harness, and never a rejection.
export function selectAfterLimitSlot({ projectId, limited, alternatives }: AfterLimitPools, now: Instant): SlotSelection {
  for (const pool of alternatives) {
    const chosen = leastLoaded(eligibleStandings(pool, projectId, now), now);
    if (chosen !== undefined) return reservedSlot(chosen);
  }
  if (slotIneligibility(limited, projectId, now) === undefined) return reservedSlot(limited.slot);
  return slotWait(earliestCooldownEnd([...alternatives.flat(), limited], projectId, now));
}
