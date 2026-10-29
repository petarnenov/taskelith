import type { AssignmentId, HarnessEvent } from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { parseAccountSlot, type AccountSlot } from '../domain/account-slot.js';
import type { ProviderCredentialId } from '../domain/capacity-reservation.js';
import { cooldownAfterLimit, type DefaultCooldownMinutes, type SlotLimitReport } from '../domain/slot-cooldown.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';

// The agent harness port's parsed limit event (its contract section 4.1).
export type HarnessLimitSignal = Extract<HarnessEvent, { readonly kind: 'account-signal'; readonly signal: 'limit' }>;

export interface SlotLimitInput {
  // The reservation of the session's attempt, which names the one slot.
  readonly assignmentId: AssignmentId;
  readonly signal: HarnessLimitSignal;
  readonly defaultCooldown: DefaultCooldownMinutes;
}

// What applying a limit reads and writes, inside a capacity transaction.
export type SlotSignalTransaction = Pick<CapacityTransaction, 'assignments' | 'accountSlots' | 'now'>;

// Applications of one limit before a lost compare-and-set is returned.
export const SLOT_LIMIT_APPLICATIONS = 3;

// Contract section 5: the limit cools the slot that the reservation names,
// by compare-and-set, rereading the slot after a lost one.
export async function applySlotLimitInTransaction(tx: SlotSignalTransaction, input: SlotLimitInput): Promise<Result<AccountSlot>> {
  const report = limitReport(input.signal);
  if (!report.ok) return report;
  const slotId = await reservedSlotOf(tx, input.assignmentId);
  if (!slotId.ok) return slotId;
  const limit: AppliedLimit = { slotId: slotId.value, report: report.value, now: await tx.now(), defaultCooldown: input.defaultCooldown };
  let applied = await applyLimit(tx, limit);
  for (let application = 1; application < SLOT_LIMIT_APPLICATIONS && isLostCompareAndSet(applied); application++) {
    applied = await applyLimit(tx, limit);
  }
  return applied;
}

interface AppliedLimit {
  readonly slotId: ProviderCredentialId;
  readonly report: SlotLimitReport;
  readonly now: Instant;
  readonly defaultCooldown: DefaultCooldownMinutes;
}

// A removed slot or an unchanged cooldown writes nothing, so the revision
// stays; a removed slot accepts the limit as a no-op.
async function applyLimit(tx: SlotSignalTransaction, { slotId, report, now, defaultCooldown }: AppliedLimit): Promise<Result<AccountSlot>> {
  const stored = await tx.accountSlots.get(slotId);
  if (!stored.ok || stored.value.state === 'removed') return stored;
  const cooldown = cooldownAfterLimit(stored.value.cooldown, report, now, defaultCooldown);
  if (cooldown === stored.value.cooldown) return ok(stored.value);
  const cooled = parseAccountSlot({ ...stored.value, cooldown, revision: stored.value.revision + 1 });
  if (!cooled.ok) return cooled;
  const replaced = await tx.accountSlots.replace(cooled.value, stored.value.revision);
  return replaced.ok ? cooled : replaced;
}

function isLostCompareAndSet(applied: Result<AccountSlot>): boolean {
  return !applied.ok && applied.error.code === 'conflict';
}

async function reservedSlotOf(tx: SlotSignalTransaction, assignmentId: AssignmentId): Promise<Result<ProviderCredentialId>> {
  const assignment = await tx.assignments.get(assignmentId);
  if (!assignment.ok) return assignment;
  const [slotId, ...others] = assignment.value.reservation.providerCredentials;
  if (slotId !== undefined && others.length === 0) return ok(slotId);
  return err(failure('precondition-failed', `the reservation of assignment ${assignmentId} names no single slot`, {
    assignment: assignmentId,
  }));
}

// The port allows nine fraction digits; a reset inside a millisecond is
// rounded up, so the cooldown never ends before it.
function limitReport({ resetsAt }: HarnessLimitSignal): Result<SlotLimitReport> {
  if (resetsAt === undefined) return ok(Object.freeze({}));
  const parsed = Date.parse(resetsAt);
  if (Number.isNaN(parsed)) return err(failure('invalid', 'the reset time of the limit is not an instant', { resetsAt }));
  const submillisecond = /[1-9]/.test(/\.\d{3}(\d*)Z$/.exec(resetsAt)?.[1] ?? '');
  return ok(Object.freeze({ resetsAtEpochMilliseconds: parsed + (submillisecond ? 1 : 0) }));
}
