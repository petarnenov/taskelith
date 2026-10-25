import type { Failure, Result } from '@taskelith/kernel';
import type { Assignment } from '../domain/assignment.js';
import { PLACEMENT_RETRY_ATTEMPTS } from '../domain/capacity-limits.js';
import { placementBackoff } from '../domain/placement-backoff.js';
import type { CapacityStore } from '../ports/capacity-store.js';
import {
  cancelInTransaction,
  placeInTransaction,
  releaseInTransaction,
  supersedeInTransaction,
  type PlacementOutcome,
  type PlacementRequest,
  type ReleaseOutcome,
  type ReleaseRequest,
} from './capacity-operations.js';

// How a retried placement waits: `draw` returns jitter in [0, 1), so tests
// replay a recorded seed.
export interface RetryTiming {
  pause(milliseconds: number): Promise<void>;
  draw(): number;
}

// Runs each capacity operation as its own SERIALIZABLE transaction of the
// store, for callers that have no transaction of their own.
export class ResourceAdmissionService {
  readonly #store: CapacityStore;
  readonly #timing: RetryTiming;

  constructor(store: CapacityStore, timing: RetryTiming) {
    this.#store = store;
    this.#timing = timing;
  }

  reserve(request: PlacementRequest): Promise<Result<PlacementOutcome>> {
    return this.#store.transaction((tx) => placeInTransaction(tx, request));
  }

  // Retries a placement that failed for a transient reason (`unavailable`)
  // with backoff; a commit of unknown outcome is not retried blindly.
  async reserveWithRetry(request: PlacementRequest): Promise<Result<PlacementOutcome>> {
    for (let attempt = 1; ; attempt++) {
      const outcome = await this.reserve(request);
      if (outcome.ok || !isRetryable(outcome.error) || attempt >= PLACEMENT_RETRY_ATTEMPTS) return outcome;
      await this.#timing.pause(placementBackoff(attempt, this.#timing.draw()));
    }
  }

  cancelAssignment(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction((tx) => cancelInTransaction(tx, request));
  }

  supersede(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction((tx) => supersedeInTransaction(tx, request));
  }

  releaseAfterTerminalFact(request: ReleaseRequest): Promise<Result<ReleaseOutcome>> {
    return this.#store.transaction((tx) => releaseInTransaction(tx, request));
  }
}

function isRetryable(failure: Failure): boolean {
  return failure.code === 'unavailable' && failure.details.outcome !== 'unknown';
}
