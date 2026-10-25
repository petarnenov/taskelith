import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Sequence, WorkerId } from '@taskelith/execution';
import type { WorkerPlacementRecord } from '../ports/placement-workers.js';
import type { CapacityDeclaration, WorkerReports } from '../ports/worker-reports.js';
import type { InMemoryPlacementWorkers } from './in-memory-capacity.js';

type ReportFence = 'capacity' | 'pressure' | 'refusal' | 'protocol';

type FenceSequences = Readonly<Record<ReportFence, number>>;

const NO_SEQUENCES: FenceSequences = Object.freeze({ capacity: 0, pressure: 0, refusal: 0, protocol: 0 });

interface FencedWrite {
  readonly fence: ReportFence;
  readonly sequence: Sequence;
}

type WorkerChange = (worker: WorkerPlacementRecord) => WorkerPlacementRecord;

// Writes an in-memory worker store and each fence's last sequence beside it;
// each write reads, checks, and writes without awaiting, so it is atomic.
export class InMemoryWorkerReports implements WorkerReports {
  readonly #workers: InMemoryPlacementWorkers;
  readonly #sequences = new Map<WorkerId, FenceSequences>();

  constructor(workers: InMemoryPlacementWorkers) {
    this.#workers = workers;
  }

  async recordContact(workerId: WorkerId, at: Instant): Promise<Result<void>> {
    return this.#change(workerId, (worker) => {
      const last = worker.lastContactAt;
      const lastContactAt = last !== undefined && Date.parse(last) >= Date.parse(at) ? last : at;
      return { ...worker, reachable: true, lastContactAt };
    });
  }

  async recordJournalLoss(workerId: WorkerId): Promise<Result<void>> {
    return this.#change(workerId, (worker) => ({ ...worker, reachable: false }));
  }

  async declareCapacity(workerId: WorkerId, declaration: CapacityDeclaration, sequence: Sequence): Promise<Result<void>> {
    return this.#change(workerId, (worker) => ({ ...worker, ...declaration, controls: Object.freeze([...declaration.controls]) }), {
      fence: 'capacity', sequence,
    });
  }

  async enterPressure(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>> {
    return this.#change(workerId, (worker) => ({ ...worker, admissionPressureSince: worker.admissionPressureSince ?? at }), {
      fence: 'pressure', sequence,
    });
  }

  async leavePressure(workerId: WorkerId, sequence: Sequence): Promise<Result<void>> {
    return this.#change(workerId, ({ admissionPressureSince: _cleared, ...worker }) => worker, { fence: 'pressure', sequence });
  }

  async markCapacityRefused(workerId: WorkerId, sequence: Sequence, at: Instant): Promise<Result<void>> {
    return this.#change(workerId, (worker) => ({ ...worker, capacityRefusedSince: worker.capacityRefusedSince ?? at }), {
      fence: 'refusal', sequence,
    });
  }

  async clearCapacityRefusal(workerId: WorkerId, sequence: Sequence): Promise<Result<void>> {
    return this.#change(workerId, ({ capacityRefusedSince: _cleared, ...worker }) => worker, { fence: 'refusal', sequence });
  }

  async setProtocolVersion(workerId: WorkerId, protocolVersion: number | undefined, sequence: Sequence): Promise<Result<void>> {
    return this.#change(workerId, ({ protocolVersion: _replaced, ...worker }) => (
      protocolVersion === undefined ? worker : { ...worker, protocolVersion }), { fence: 'protocol', sequence });
  }

  // A fenced write at or below its fence's sequence succeeds unapplied; the
  // fence advances only with a write that applies.
  #change(workerId: WorkerId, change: WorkerChange, fenced?: FencedWrite): Result<void> {
    const worker = this.#workers.current(workerId);
    if (worker === undefined) return err(failure('not-found', `worker ${workerId} has no record`, { worker: workerId }));
    if (fenced !== undefined) {
      const sequences = this.#sequences.get(workerId) ?? NO_SEQUENCES;
      if (fenced.sequence <= sequences[fenced.fence]) return ok(undefined);
      this.#sequences.set(workerId, { ...sequences, [fenced.fence]: fenced.sequence });
    }
    this.#workers.replace(change(worker));
    return ok(undefined);
  }
}
