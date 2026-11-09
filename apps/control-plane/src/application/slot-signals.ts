import type { AssignmentId } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import {
  applySlotLimitInTransaction,
  type AccountSlot,
  type DefaultCooldownMinutes,
  type HarnessLimitSignal,
  type SlotSignalTransaction,
} from '@taskelith/scheduling';

export interface SlotLimitSignal {
  readonly assignmentId: AssignmentId;
  readonly signal: HarnessLimitSignal;
}

// The account signals of a session's slot with the installation's default
// cooldown (decision Q7); item 18 relays the signals to it.
export class SlotSignals {
  readonly defaultCooldown: DefaultCooldownMinutes;

  constructor(defaultCooldown: DefaultCooldownMinutes) {
    this.defaultCooldown = defaultCooldown;
  }

  applyLimit(tx: SlotSignalTransaction, { assignmentId, signal }: SlotLimitSignal): Promise<Result<AccountSlot>> {
    return applySlotLimitInTransaction(tx, { assignmentId, signal, defaultCooldown: this.defaultCooldown });
  }
}
