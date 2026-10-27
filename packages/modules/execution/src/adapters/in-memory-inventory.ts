import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { WorkerId } from '../domain/identifiers.js';
import type { InventoryPart, InventoryRequest } from '../domain/inventory.js';
import type { JournalId } from '../domain/observation-sequence.js';
import type { InventoryReports } from '../ports/inventory-reports.js';
import type { InventoryRequests } from '../ports/inventory-requests.js';

// Keeps the latest inventory request of each worker in process memory.
export class InMemoryInventoryRequests implements InventoryRequests {
  readonly #requests = new Map<WorkerId, InventoryRequest>();

  async current(workerId: WorkerId): Promise<InventoryRequest | undefined> {
    return this.#requests.get(workerId);
  }

  async save(request: InventoryRequest): Promise<Result<void>> {
    this.#requests.set(request.workerId, structuredClone(request));
    return ok(undefined);
  }
}

// Keeps pending snapshot parts in process memory.
export class InMemoryInventoryReports implements InventoryReports {
  readonly #parts = new Map<string, InventoryPart>();

  async add(part: InventoryPart): Promise<Result<void>> {
    const key = JSON.stringify([part.reportId, part.part]);
    if (this.#parts.has(key)) return err(failure('conflict', `part ${part.part} of report ${part.reportId} is stored`, { report: part.reportId }));
    this.#parts.set(key, structuredClone(part));
    return ok(undefined);
  }

  async listByJournal(workerId: WorkerId, journalId: JournalId): Promise<readonly InventoryPart[]> {
    return [...this.#parts.values()]
      .filter((part) => part.workerId === workerId && part.journalId === journalId)
      .sort(byReportOrder);
  }

  async remove(reportId: string): Promise<Result<void>> {
    return this.#removeWhere((part) => part.reportId === reportId);
  }

  async removeByJournal(workerId: WorkerId, journalId: JournalId): Promise<Result<void>> {
    return this.#removeWhere((part) => part.workerId === workerId && part.journalId === journalId);
  }

  #removeWhere(removed: (part: InventoryPart) => boolean): Result<void> {
    for (const [key, part] of this.#parts) if (removed(part)) this.#parts.delete(key);
    return ok(undefined);
  }
}

function byReportOrder(left: InventoryPart, right: InventoryPart): number {
  if (left.snapshot !== right.snapshot) return left.snapshot - right.snapshot;
  if (left.reportId !== right.reportId) return left.reportId < right.reportId ? -1 : 1;
  return left.part - right.part;
}
