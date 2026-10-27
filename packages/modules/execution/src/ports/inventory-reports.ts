import type { Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import type { InventoryPart } from '../domain/inventory.js';
import type { JournalId } from '../domain/observation-sequence.js';

// The stored parts of snapshots that cannot be applied yet, keyed by
// `(reportId, part)`; `add` is `conflict` for a stored key.
export interface InventoryReports {
  add(part: InventoryPart): Promise<Result<void>>;
  // The journal's parts by `snapshot`, then report, then part.
  listByJournal(workerId: WorkerId, journalId: JournalId): Promise<readonly InventoryPart[]>;
  // Every part of the report.
  remove(reportId: string): Promise<Result<void>>;
  // Every part of every report of the journal.
  removeByJournal(workerId: WorkerId, journalId: JournalId): Promise<Result<void>>;
}
