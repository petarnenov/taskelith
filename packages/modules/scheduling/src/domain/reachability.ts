import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';
import { FIRST_GENERATION, nextGeneration, type Generation } from '@taskelith/sdlc';

// Whether the control plane is in contact with a worker. It is orthogonal to
// execution: no attempt, assignment, or reservation changes with it.
export const REACHABILITY_STATES = Object.freeze(['reachable', 'unknown'] as const);

export type ReachabilityState = (typeof REACHABILITY_STATES)[number];

export interface WorkerReachability {
  readonly workerId: WorkerId;
  readonly state: ReachabilityState;
  readonly lastContactAt: Instant;
  readonly generation: Generation;
  readonly changedAt: Instant;
}

export function firstContact(workerId: WorkerId, contactAt: Instant): WorkerReachability {
  return Object.freeze({ workerId, state: 'reachable', lastContactAt: contactAt, generation: FIRST_GENERATION, changedAt: contactAt });
}

// A contact older than the last one arrived out of order and changes nothing.
export function recordContact(reachability: WorkerReachability, contactAt: Instant): WorkerReachability {
  if (Date.parse(contactAt) <= Date.parse(reachability.lastContactAt)) return reachability;
  return changed(reachability, { state: 'reachable', lastContactAt: contactAt }, contactAt);
}

// Marks contact lost only if no contact arrived after the one the timeout
// was measured from; loss of contact never proves that a process died.
export function recordContactLost(reachability: WorkerReachability, measuredFrom: Instant, at: Instant): Result<WorkerReachability> {
  if (reachability.lastContactAt !== measuredFrom) {
    return err(failure('conflict', `worker ${reachability.workerId} was in contact after ${measuredFrom}`, {
      worker: reachability.workerId,
    }));
  }
  if (reachability.state === 'unknown') return ok(reachability);
  return ok(changed(reachability, { state: 'unknown', lastContactAt: reachability.lastContactAt }, at));
}

function changed(
  reachability: WorkerReachability,
  change: Pick<WorkerReachability, 'state' | 'lastContactAt'>,
  at: Instant,
): WorkerReachability {
  return Object.freeze({ ...reachability, ...change, generation: nextGeneration(reachability.generation), changedAt: at });
}
