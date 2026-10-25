import type { Instant } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';
import type { HardControl } from '../domain/capacity-reservation.js';

// What placement reads about a worker. Enrollment, declarations, pressure,
// and reachability write it (items 13, 20, 21), always at SERIALIZABLE.
export interface WorkerPlacementRecord {
  readonly workerId: WorkerId;
  readonly enrolled: boolean;
  readonly revoked: boolean;
  readonly draining: boolean;
  readonly reachable: boolean;
  readonly admissionPressureSince?: Instant;
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly controls: readonly HardControl[];
  // The highest protocol version the worker and the control plane share, set
  // at enrollment; a worker without one is never placed on.
  readonly protocolVersion?: number;
}

export interface PlacementWorkers {
  get(workerId: WorkerId): Promise<WorkerPlacementRecord | undefined>;
  // The slots of every worker eligible for new placement.
  eligibleSlots(): Promise<number>;
  // The eligible workers, fewest held reservations first, then by identity.
  candidates(): Promise<readonly WorkerId[]>;
}

export function isEligibleForPlacement(worker: WorkerPlacementRecord): boolean {
  return worker.enrolled && !worker.revoked && !worker.draining && worker.reachable && worker.admissionPressureSince === undefined
    && worker.protocolVersion !== undefined;
}
