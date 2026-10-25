import type { Instant, Result } from '@taskelith/kernel';
import type { Sequence, WorkerId } from '@taskelith/execution';
import type { HardControl } from '../domain/capacity-reservation.js';

// What a worker declares about itself; the protocol version is the one its
// window shares with the control plane, if any.
export interface CapacityDeclaration {
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly controls: readonly HardControl[];
  readonly protocolVersion?: number;
}

// Writes the worker record placement reads; a declaration or a pressure
// change applies only above its kind's last sequence (decision 13 of 21b).
export interface WorkerReports {
  // Reachable, with the last contact moved to `at` but never backward; each
  // write is `not-found` for a worker without a record.
  recordContact(workerId: WorkerId, at: Instant): Promise<Result<void>>;
  // Also clears a capacity refusal.
  declareCapacity(workerId: WorkerId, declaration: CapacityDeclaration, sequence: Sequence): Promise<Result<void>>;
  // Under pressure since `at`, or since the earlier start it already had.
  enterPressure(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>>;
  leavePressure(workerId: WorkerId, sequence: Sequence): Promise<Result<void>>;
  // Refused for capacity since `at`, or since an earlier refusal it keeps.
  markCapacityRefused(workerId: WorkerId, at: Instant): Promise<Result<void>>;
  clearCapacityRefusal(workerId: WorkerId): Promise<Result<void>>;
  setProtocolVersion(workerId: WorkerId, protocolVersion: number | undefined): Promise<Result<void>>;
}
