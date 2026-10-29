import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AccountSlot } from '../domain/account-slot.js';
import type { ProjectId } from '../domain/capacity-reservation.js';
import { selectNewSessionSlot, type SlotStanding } from '../domain/least-loaded-selection.js';
import { selectAfterLimitSlot, selectResumedSessionSlot } from '../domain/session-slot-selection.js';
import { parseSlotRequest, type HarnessSlot, type SlotRequest, type SlotSelection } from '../domain/slot-selection.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';

type RequestOf<Kind extends SlotRequest['kind']> = Extract<SlotRequest, { readonly kind: Kind }>;

// Contract section 4.7: the selection only reads, inside the placement
// transaction, at its database time.
export async function selectSlotInTransaction(tx: CapacityTransaction, request: SlotRequest): Promise<Result<SlotSelection>> {
  const parsed = parseSlotRequest(request);
  if (!parsed.ok) return parsed;
  const slotRequest = parsed.value;
  const now = await tx.now();
  switch (slotRequest.kind) {
    case 'new-session': return ok(await newSession(tx, slotRequest, now));
    case 'resumed-session': return resumedSession(tx, slotRequest, now);
    case 'after-limit': return afterLimit(tx, slotRequest, now);
  }
}

async function newSession(tx: CapacityTransaction, request: RequestOf<'new-session'>, now: Instant): Promise<SlotSelection> {
  const { projectId, harnessId, whenNoSlot } = request;
  return selectNewSessionSlot({ projectId, whenNoSlot, standings: await poolStandings(tx, projectId, harnessId) }, now);
}

async function resumedSession(tx: CapacityTransaction, request: RequestOf<'resumed-session'>, now: Instant): Promise<Result<SlotSelection>> {
  const own = await sessionSlot(tx, request.pinned);
  if (!own.ok) return own;
  return ok(selectResumedSessionSlot({ projectId: request.projectId, own: own.value }, now));
}

// Reads no pool of the limited harness, so none of its other slots is chosen.
async function afterLimit(tx: CapacityTransaction, request: RequestOf<'after-limit'>, now: Instant): Promise<Result<SlotSelection>> {
  const limited = await sessionSlot(tx, request.limited);
  if (!limited.ok) return limited;
  const { projectId } = request;
  const alternatives = await Promise.all(request.alternatives.map((harnessId) => poolStandings(tx, projectId, harnessId)));
  return ok(selectAfterLimitSlot({ projectId, limited: limited.value, alternatives }, now));
}

// The stored slot in any state; a request naming another harness for it
// is `invalid` (contract section 4.1).
async function sessionSlot(tx: CapacityTransaction, named: HarnessSlot): Promise<Result<SlotStanding>> {
  const stored = await tx.accountSlots.get(named.slotId);
  if (!stored.ok) return stored;
  if (stored.value.harnessId !== named.harnessId) {
    return err(failure('invalid', `slot ${named.slotId} belongs to another harness than the request names`, {
      slot: named.slotId, harness: named.harnessId,
    }));
  }
  return ok(await standingOf(tx, stored.value));
}

async function poolStandings(tx: CapacityTransaction, projectId: ProjectId, harnessId: HarnessPluginId): Promise<readonly SlotStanding[]> {
  return Promise.all((await tx.accountSlots.pool(projectId, harnessId)).map((slot) => standingOf(tx, slot)));
}

async function standingOf(tx: CapacityTransaction, slot: AccountSlot): Promise<SlotStanding> {
  return { slot, held: await tx.ledger.heldForCredential(slot.id) };
}
