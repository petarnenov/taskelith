import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Sequence, SelfCheckResult, WorkerId } from '@taskelith/execution';
import type { WorkerAdmissionDecision, WorkerAdmissionState } from '../domain/worker-admission.js';
import type { FleetRegistry } from '../ports/fleet-registry.js';
import type {
  AdmissionRecording,
  WorkerAdmissionEntry,
  WorkerAdmissionSnapshot,
  WorkerAdmissions,
  WorkerAdmissionView,
} from '../ports/worker-admissions.js';

interface StoredAdmission {
  readonly state: WorkerAdmissionState;
  readonly fence: number;
  readonly reportedAt?: Instant;
  readonly results: readonly SelfCheckResult[];
}

const AWAITING: StoredAdmission = Object.freeze({ state: 'awaiting-self-check', fence: 0, results: Object.freeze([]) });

export interface InMemoryWorkerAdmissionsOptions {
  readonly registry: Pick<FleetRegistry, 'worker' | 'activeWorkerIds'>;
  readonly now: () => Instant;
  // Mirrors the state into a placement store, as one row does in SQL.
  readonly onAdmission?: (workerId: WorkerId, admitted: boolean) => void;
}

// Worker admission over a registry; each write checks and stores without
// awaiting after its read, so it is atomic.
export class InMemoryWorkerAdmissions implements WorkerAdmissions, WorkerAdmissionView {
  readonly #options: InMemoryWorkerAdmissionsOptions;
  readonly #admissions = new Map<WorkerId, StoredAdmission>();

  constructor(options: InMemoryWorkerAdmissionsOptions) {
    this.#options = options;
  }

  async record(
    workerId: WorkerId, decision: WorkerAdmissionDecision, sequence: Sequence, at: Instant,
  ): Promise<Result<AdmissionRecording>> {
    const known = await this.#known(workerId);
    if (!known.ok) return known;
    if (sequence <= this.#current(workerId).fence) return ok('fenced');
    this.#store(workerId, { state: decision.state, fence: sequence, reportedAt: at, results: decision.results });
    return ok('applied');
  }

  async awaitSelfCheck(workerId: WorkerId): Promise<Result<void>> {
    const known = await this.#known(workerId);
    if (!known.ok) return known;
    this.#store(workerId, AWAITING);
    return ok(undefined);
  }

  async workers(): Promise<Result<WorkerAdmissionSnapshot>> {
    const asOf = this.#options.now();
    const ids = await this.#options.registry.activeWorkerIds();
    if (!ids.ok) return ids;
    const workers: WorkerAdmissionEntry[] = [];
    for (const workerId of ids.value) {
      const worker = await this.#options.registry.worker(workerId);
      if (!worker.ok) return worker;
      if (worker.value === undefined) continue;
      const { state, reportedAt, results } = this.#current(workerId);
      workers.push(Object.freeze({
        workerId, host: worker.value.host, enrolledAt: worker.value.enrolledAt, admission: state,
        ...(reportedAt === undefined ? {} : { reportedAt }), results,
      }));
    }
    return ok(Object.freeze({ asOf, workers: Object.freeze(workers) }));
  }

  #current(workerId: WorkerId): StoredAdmission {
    return this.#admissions.get(workerId) ?? AWAITING;
  }

  #store(workerId: WorkerId, admission: StoredAdmission): void {
    this.#admissions.set(workerId, Object.freeze(admission));
    this.#options.onAdmission?.(workerId, admission.state === 'admitted');
  }

  async #known(workerId: WorkerId): Promise<Result<void>> {
    const worker = await this.#options.registry.worker(workerId);
    if (!worker.ok) return worker;
    return worker.value === undefined ? err(failure('not-found', `worker ${workerId} has no record`, { worker: workerId })) : ok(undefined);
  }
}
