import type { Instant } from '@taskelith/kernel';
import type { AccountSlot, SlotIneligibilityReason } from './account-slot.js';
import type { ProjectId } from './capacity-reservation.js';
import { byCodeUnits } from './code-unit-order.js';
import { SLOT_WAITING_REASON, type NoSlotPolicy, type SlotSelection } from './slot-selection.js';

// A slot with its held reservations, both read in the reservation transaction.
export interface SlotStanding {
  readonly slot: AccountSlot;
  readonly held: number;
}

export interface NewSessionPool {
  readonly projectId: ProjectId;
  readonly whenNoSlot: NoSlotPolicy;
  readonly standings: readonly SlotStanding[];
}

// Below every reservation time, and its difference to itself is zero.
const NEVER_RESERVED = Number.MIN_SAFE_INTEGER;

// Contract section 3.2: the first failing check in its order, if any.
export function slotIneligibility(standing: SlotStanding, projectId: ProjectId, now: Instant): SlotIneligibilityReason | undefined {
  const { slot, held } = standing;
  if (slot.state === 'removed') return 'removed';
  if (slot.state === 'revoked') return 'revoked';
  if (!slot.allowedProjects.includes(projectId)) return 'not-allowed';
  if (slot.health === 'unhealthy') return 'unhealthy';
  if (isCoolingDown(slot, now)) return 'cooling-down';
  return held < slot.concurrencyLimit ? undefined : 'at-concurrency-limit';
}

// Contract sections 4.2, 4.5, and 4.6 for a `new-session` request; it
// changes no slot, whatever its outcome.
export function selectNewSessionSlot(pool: NewSessionPool, now: Instant): SlotSelection {
  const chosen = leastLoaded(eligibleStandings(pool.standings, pool.projectId, now), now);
  if (chosen !== undefined) return reservedSlot(chosen);
  if (pool.whenNoSlot === 'reject') return Object.freeze({ outcome: 'rejected', reason: 'no-eligible-slot' });
  return slotWait(earliestCooldownEnd(pool.standings, pool.projectId, now));
}

export function eligibleStandings(standings: readonly SlotStanding[], projectId: ProjectId, now: Instant): readonly SlotStanding[] {
  return standings.filter((standing) => slotIneligibility(standing, projectId, now) === undefined);
}

export function reservedSlot(slot: AccountSlot): SlotSelection {
  return Object.freeze({ outcome: 'reserved', slot: Object.freeze({ harnessId: slot.harnessId, slotId: slot.id }) });
}

export function slotWait(earliestCooldown: Instant | undefined): SlotSelection {
  return Object.freeze({
    outcome: 'waiting', reason: SLOT_WAITING_REASON, ...(earliestCooldown === undefined ? {} : { earliestCooldownEnd: earliestCooldown }),
  });
}

// Fewest held, then usage only when every tied slot reports within its
// window, then least recently reserved, then lowest id (section 4.2).
export function leastLoaded(eligible: readonly SlotStanding[], now: Instant): AccountSlot | undefined {
  if (eligible.length === 0) return undefined;
  const fewest = Math.min(...eligible.map((standing) => standing.held));
  const tied = eligible.filter((standing) => standing.held === fewest).map((standing) => standing.slot);
  const byUsage = tied.every((slot) => hasCurrentUsage(slot, now)) ? lowestUsage(tied) : tied;
  return [...byUsage].sort(byReservationAge)[0];
}

function lowestUsage(slots: readonly AccountSlot[]): readonly AccountSlot[] {
  const lowest = Math.min(...slots.map((slot) => slot.usage!.fraction));
  return slots.filter((slot) => slot.usage!.fraction === lowest);
}

// A slot never reserved is the least recently reserved one.
function byReservationAge(left: AccountSlot, right: AccountSlot): number {
  const age = reservedAt(left) - reservedAt(right);
  return age === 0 ? byCodeUnits(left.id, right.id) : age;
}

function reservedAt(slot: AccountSlot): number {
  return slot.lastReservedAt === undefined ? NEVER_RESERVED : Date.parse(slot.lastReservedAt);
}

function hasCurrentUsage(slot: AccountSlot, now: Instant): boolean {
  return slot.usage !== undefined && Date.parse(slot.usage.windowEndsAt) > Date.parse(now);
}

function isCoolingDown(slot: AccountSlot, now: Instant): boolean {
  return slot.cooldown !== undefined && Date.parse(slot.cooldown.until) > Date.parse(now);
}

// The earliest end among the slots whose first obstacle is their cooldown.
export function earliestCooldownEnd(standings: readonly SlotStanding[], projectId: ProjectId, now: Instant): Instant | undefined {
  const cooling = standings.filter((standing) => slotIneligibility(standing, projectId, now) === 'cooling-down');
  return cooling.map(({ slot }) => slot.cooldown!.until).sort((left, right) => Date.parse(left) - Date.parse(right))[0];
}
