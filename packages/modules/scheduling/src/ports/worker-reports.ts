import type { Instant, Result } from '@taskelith/kernel';
import type { Sequence, WorkerId } from '@taskelith/execution';
import type { HardControl } from '../domain/capacity-reservation.js';

// What a worker declares about its capacity.
export interface CapacityDeclaration {
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly controls: readonly HardControl[];
}

// Writes the worker record placement reads. Each fenced write applies only
// above its fence's last sequence, which it advances (21b decision 13).
export interface WorkerReports {
  // Reachable, with the last contact moved to `at` but never backward; each
  // write is `not-found` for a worker without a record.
  recordContact(workerId: WorkerId, at: Instant): Promise<Result<void>>;
  // Up to `limit` reachable workers last in contact before `before`, oldest
  // first, become unreachable; it returns them ordered by identity.
  markContactLost(before: Instant, limit: number): Promise<Result<readonly WorkerId[]>>;
  // The capacity fence.
  declareCapacity(workerId: WorkerId, declaration: CapacityDeclaration, sequence: Sequence): Promise<Result<void>>;
  // The pressure fence; under pressure since `at`, or an earlier start.
  enterPressure(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>>;
  leavePressure(workerId: WorkerId, sequence: Sequence): Promise<Result<void>>;
  // The refusal fence; refused for capacity since `at`, or an earlier mark.
  markCapacityRefused(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>>;
  clearCapacityRefusal(workerId: WorkerId, sequence: Sequence): Promise<Result<void>>;
  // The protocol fence; `undefined` is no version both windows share.
  setProtocolVersion(workerId: WorkerId, protocolVersion: number | undefined, sequence: Sequence): Promise<Result<void>>;
}
