import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Sequence, WorkerId } from '@taskelith/execution';
import type { WorkerPlacementRecord } from '../ports/placement-workers.js';
import type { CapacityDeclaration, WorkerReports } from '../ports/worker-reports.js';
import type { InMemoryPlacementWorkers } from './in-memory-capacity.js';

interface ReportSequences {
  readonly capacity: number;
  readonly pressure: number;
}

type WorkerChange = (worker: WorkerPlacementRecord) => WorkerPlacementRecord;

// Writes the records of an in-memory worker store, keeping the last applied
// sequence of each kind beside them, as the database adapter's columns do.
export class InMemoryWorkerReports implements WorkerReports {
  readonly #workers: InMemoryPlacementWorkers;
  readonly #sequences = new Map<WorkerId, ReportSequences>();

  constructor(workers: InMemoryPlacementWorkers) {
    this.#workers = workers;
  }

  recordContact(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    return this.#change(workerId, (worker) => {
      const last = worker.lastContactAt;
      const lastContactAt = last !== undefined && Date.parse(last) >= Date.parse(at) ? last : at;
      return { ...worker, reachable: true, lastContactAt };
    });
  }

  async declareCapacity(workerId: WorkerId, declaration: CapacityDeclaration, sequence: Sequence): Promise<Result<void>> {
    if (!this.#advance(workerId, 'capacity', sequence)) return this.#change(workerId, (worker) => worker);
    return this.#change(workerId, ({ capacityRefusedSince: _cleared, protocolVersion: _replaced, ...worker }) => ({
      ...worker, ...declaration, controls: Object.freeze([...declaration.controls]),
    }));
  }

  async enterPressure(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>> {
    if (!this.#advance(workerId, 'pressure', sequence)) return this.#change(workerId, (worker) => worker);
    return this.#change(workerId, (worker) => ({ ...worker, admissionPressureSince: worker.admissionPressureSince ?? at }));
  }

  async leavePressure(workerId: WorkerId, sequence: Sequence): Promise<Result<void>> {
    if (!this.#advance(workerId, 'pressure', sequence)) return this.#change(workerId, (worker) => worker);
    return this.#change(workerId, ({ admissionPressureSince: _cleared, ...worker }) => worker);
  }

  markCapacityRefused(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    return this.#change(workerId, (worker) => ({ ...worker, capacityRefusedSince: worker.capacityRefusedSince ?? at }));
  }

  clearCapacityRefusal(workerId: WorkerId): Promise<Result<void>> {
    return this.#change(workerId, ({ capacityRefusedSince: _cleared, ...worker }) => worker);
  }

  setProtocolVersion(workerId: WorkerId, protocolVersion: number | undefined): Promise<Result<void>> {
    return this.#change(workerId, ({ protocolVersion: _replaced, ...worker }) => (
      protocolVersion === undefined ? worker : { ...worker, protocolVersion }));
  }

  // Whether the sequence is above the last one of its kind, which it becomes.
  #advance(workerId: WorkerId, kind: keyof ReportSequences, sequence: Sequence): boolean {
    const sequences = this.#sequences.get(workerId) ?? { capacity: 0, pressure: 0 };
    if (sequence <= sequences[kind]) return false;
    this.#sequences.set(workerId, { ...sequences, [kind]: sequence });
    return true;
  }

  async #change(workerId: WorkerId, change: WorkerChange): Promise<Result<void>> {
    const worker = await this.#workers.get(workerId);
    if (worker === undefined) return err(failure('not-found', `worker ${workerId} has no record`, { worker: workerId }));
    this.#workers.replace(change(worker));
    return ok(undefined);
  }
}
