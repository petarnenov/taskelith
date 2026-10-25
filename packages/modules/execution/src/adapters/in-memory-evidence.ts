import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ContentDigest, TaskId } from '@taskelith/sdlc';
import type { EvidenceId, EvidenceRecord } from '../domain/evidence.js';
import type { EvidenceRecords } from '../ports/evidence-records.js';

// Keeps records in process memory, in publication order.
export class InMemoryEvidenceRecords implements EvidenceRecords {
  readonly #records = new Map<EvidenceId, EvidenceRecord>();

  async get(id: EvidenceId): Promise<Result<EvidenceRecord | undefined>> {
    return ok(this.#records.get(id));
  }

  async add(record: EvidenceRecord): Promise<Result<void>> {
    const id = record.evidenceId;
    if (this.#records.has(id)) return err(failure('conflict', `evidence ${id} already exists`, { evidence: id }));
    this.#records.set(id, record);
    return ok(undefined);
  }

  async listByTask(taskId: TaskId): Promise<Result<readonly EvidenceRecord[]>> {
    return ok([...this.#records.values()].filter((record) => record.taskId === taskId));
  }

  async countByDigest(digest: ContentDigest): Promise<Result<number>> {
    return ok([...this.#records.values()].filter((record) => record.contentDigest === digest).length);
  }

  async remove(id: EvidenceId): Promise<Result<void>> {
    if (!this.#records.delete(id)) return err(failure('not-found', `evidence ${id} does not exist`, { evidence: id }));
    return ok(undefined);
  }

  // One process has no concurrent transaction to serialize against.
  async lockDigest(_digest: ContentDigest): Promise<Result<void>> {
    return ok(undefined);
  }
}
