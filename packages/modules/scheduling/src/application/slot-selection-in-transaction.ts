import { err, failure, ok, type Result } from '@taskelith/kernel';
import { selectNewSessionSlot } from '../domain/least-loaded-selection.js';
import { parseSlotRequest, type SlotRequest, type SlotSelection } from '../domain/slot-selection.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';

// Contract section 4.7: the selection only reads, inside the placement
// transaction, at its database time.
export async function selectSlotInTransaction(tx: CapacityTransaction, request: SlotRequest): Promise<Result<SlotSelection>> {
  const parsed = parseSlotRequest(request);
  if (!parsed.ok) return parsed;
  const slotRequest = parsed.value;
  // G3 sub-change 12b selects for the other kinds (design question Q1).
  if (slotRequest.kind !== 'new-session') {
    return err(failure('invalid', `a ${slotRequest.kind} slot request is not supported yet`, { kind: slotRequest.kind }));
  }
  const pool = await tx.accountSlots.pool(slotRequest.projectId, slotRequest.harnessId);
  const standings = await Promise.all(pool.map(async (slot) => ({ slot, held: await tx.ledger.heldForCredential(slot.id) })));
  const { projectId, whenNoSlot } = slotRequest;
  return ok(selectNewSessionSlot({ projectId, whenNoSlot, standings }, await tx.now()));
}
