import type { Result } from '@taskelith/kernel';
import type { ContentDigest, TaskId } from '@taskelith/sdlc';
import type { EvidenceId, EvidenceRecord } from '../domain/evidence.js';

// The metadata of stored evidence; a record is written once and never
// changed, only removed after its retention.
export interface EvidenceRecords {
  get(id: EvidenceId): Promise<Result<EvidenceRecord | undefined>>;
  // `conflict` when a record with this identity exists.
  add(record: EvidenceRecord): Promise<Result<void>>;
  // In publication order.
  listByTask(taskId: TaskId): Promise<Result<readonly EvidenceRecord[]>>;
  countByDigest(digest: ContentDigest): Promise<Result<number>>;
  // `not-found` when no record has this identity.
  remove(id: EvidenceId): Promise<Result<void>>;
  // Serializes, until the transaction ends, every writer of one digest's
  // content, so that removing unreferenced content cannot race a publication.
  lockDigest(digest: ContentDigest): Promise<Result<void>>;
}
