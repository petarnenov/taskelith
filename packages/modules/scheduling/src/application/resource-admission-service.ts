import type { Result } from '@taskelith/kernel';
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
  type ReleaseRequest,
} from './capacity-operations.js';

// Runs each capacity operation as its own SERIALIZABLE transaction of the
// store, for callers that have no transaction of their own.
export class ResourceAdmissionService {
  readonly #store: CapacityStore;

  constructor(store: CapacityStore) {
    this.#store = store;
  }

  reserve(request: PlacementRequest): Promise<Result<PlacementOutcome>> {
    return this.#store.transaction((tx) => placeInTransaction(tx, request));
  }

  // Retries a placement that failed for a transient reason (`unavailable`),
  // waiting the bounded backoff between attempts; `draw` returns [0, 1).
  async reserveWithRetry(request: PlacementRequest, pause: (milliseconds: number) => Promise<void>, draw: () => number): Promise<Result<PlacementOutcome>> {
    for (let attempt = 1; ; attempt++) {
      const outcome = await this.reserve(request);
      if (outcome.ok || outcome.error.code !== 'unavailable' || attempt >= PLACEMENT_RETRY_ATTEMPTS) return outcome;
      await pause(placementBackoff(attempt, draw()));
    }
  }

  cancelAssignment(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction((tx) => cancelInTransaction(tx, request));
  }

  supersede(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction((tx) => supersedeInTransaction(tx, request));
  }

  releaseAfterTerminalFact(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction((tx) => releaseInTransaction(tx, request));
  }
}
