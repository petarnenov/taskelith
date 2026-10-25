import type { HttpSchemas } from '@taskelith/contracts';
import type { EvidenceRecord } from '@taskelith/execution';

export type EvidenceView = HttpSchemas['EvidenceRecord'];

// The contract shape of a stored record, shared by the evidence and task
// result operations.
export function viewOf(record: EvidenceRecord): EvidenceView {
  return JSON.parse(JSON.stringify(record)) as EvidenceView;
}
