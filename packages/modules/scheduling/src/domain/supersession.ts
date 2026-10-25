import type { Instant } from '@taskelith/kernel';
import type { Assignment } from './assignment.js';
import {
  ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS,
  UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS,
} from './capacity-limits.js';

// What supersession reads about the worker of an assignment; `undefined` is
// a worker the scheduler does not know.
export interface SupersessionWorker {
  readonly revoked: boolean;
  readonly draining: boolean;
  readonly reachable: boolean;
  readonly admissionPressureSince?: Instant;
}

// Contract section 6: due at once for a gone worker, otherwise after the
// acknowledgement or admission pressure bound.
export function isSupersessionDue(assignment: Assignment, worker: SupersessionWorker | undefined, at: Instant): boolean {
  if (worker === undefined || worker.revoked || worker.draining || !worker.reachable) return true;
  const unacknowledged = assignment.state === 'offered'
    && elapsed(assignment.reservation.createdAt, at) >= UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS;
  const pressured = worker.admissionPressureSince !== undefined
    && elapsed(worker.admissionPressureSince, at) >= ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS;
  return unacknowledged || pressured;
}

function elapsed(from: Instant, to: Instant): number {
  return Date.parse(to) - Date.parse(from);
}
