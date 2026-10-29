import type { ExecutionId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import type { ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotDeliveryRecord } from '../domain/slot-credential-delivery.js';

// The executions that had a slot credential delivery, read and written in
// the delivery's transaction; no record holds a credential.
export interface SlotCredentialDeliveries {
  find(taskId: TaskId, executionId: ExecutionId, slotId: ProviderCredentialId): Promise<SlotDeliveryRecord | undefined>;
  // Every slot delivered to the execution, by code point of slot id.
  listByExecution(taskId: TaskId, executionId: ExecutionId): Promise<readonly SlotDeliveryRecord[]>;
  // Stores a first record, or replaces the one of its execution and slot.
  record(delivery: SlotDeliveryRecord): Promise<void>;
}
