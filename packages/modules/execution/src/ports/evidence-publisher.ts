import type { Result } from '@taskelith/kernel';
import type { EvidencePublication, EvidenceRecord } from '../domain/evidence.js';

// A worker's side of `publishEvidence`. `unavailable` means no answer was
// read; the producer-chosen `evidenceId` makes a repeat idempotent.
export interface EvidencePublisher {
  publish(publication: EvidencePublication, content: Uint8Array): Promise<Result<EvidenceRecord>>;
}
