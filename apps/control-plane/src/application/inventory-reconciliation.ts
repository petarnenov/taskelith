import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import {
  assembleSnapshot,
  classifyOmission,
  highestAppliedSequence,
  isRolledBack,
  startProducerCursor,
  type InventoryPart,
  type InventoryRequest,
  type InventorySnapshot,
  type JournalId,
  type ProducerJournal,
  type WorkerId,
} from '@taskelith/execution';
import { ok, parseEventMetadata, type Result } from '@taskelith/kernel';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import {
  reconcileLostHistory,
  resendIfUngranted,
  retireJournal,
  type ReconciliationContext,
} from './journal-reconciliation.js';

const REQUEST = 'worker.inventory.requested';

// Decisions 4 and 5: a fresh request with its bound, appended to the
// worker's command subject; one per worker in a transaction.
export async function requestInventory(tx: ControlPlaneTransaction, workerId: WorkerId, context: ReconciliationContext): Promise<Result<void>> {
  if (context.requested.has(workerId)) return ok(undefined);
  const requestId = context.newRequestId();
  const at = await tx.now();
  const unfinished = await tx.assignments.listUnfinishedByWorker(workerId);
  const bound = (await tx.cursors.listByWorker(workerId)).map(({ cursor }) => Object.freeze({
    journalId: cursor.journalId,
    sequence: highestAppliedSequence(cursor),
    assignmentIds: unfinished.filter(({ acceptance }) => acceptance?.journalId === cursor.journalId).map(({ id }) => id),
  }));
  const saved = await tx.inventoryRequests.save({ workerId, requestId, requestedAt: at, bound });
  if (!saved.ok) return saved;
  const metadata = parseEventMetadata({ eventId: `i${requestId}`, eventType: REQUEST, schemaVersion: 1, occurredAt: at, correlationId: requestId });
  if (!metadata.ok) return metadata;
  const protocolVersion = (await tx.workers.get(workerId))?.protocolVersion ?? EXECUTION_PROTOCOL_VERSION;
  const payload: MessageSchemas['InventoryRequested'] = {
    messageType: REQUEST, schemaVersion: 1, protocolVersion, issuedAt: at, workerId, requestId,
  };
  const appended = await tx.outbox.append({ metadata: metadata.value, subject: `workers.${workerId}.commands`, payload: { ...payload } });
  if (appended.ok) context.requested.add(workerId);
  return appended;
}

// Decision 7, receipt: a part that is not fresh, below a snapshot already
// received, is discarded; an unsolicited report requests inventory.
export async function receivePart(tx: ControlPlaneTransaction, part: InventoryPart, context: ReconciliationContext): Promise<Result<void>> {
  const { workerId, journalId } = part;
  const current = await tx.inventoryRequests.current(workerId);
  const fresh = isFresh(part, current);
  const journal = await producerJournal(tx, workerId, journalId);
  if (!fresh && part.snapshot < journal.reportedSnapshot) return ok(undefined);
  const pending = await tx.inventoryReports.listByJournal(workerId, journalId);
  const replaced = fresh ? [] : pending.filter((stored) => stored.snapshot < part.snapshot && !isFresh(stored, current));
  for (const reportId of new Set(replaced.map((stored) => stored.reportId))) {
    const removed = await tx.inventoryReports.remove(reportId);
    if (!removed.ok) return removed;
  }
  const added = await tx.inventoryReports.add(part);
  if (!added.ok) return added;
  const raised = await tx.cursors.recordReportedSnapshot(workerId, journalId, part.snapshot);
  if (!raised.ok) return raised;
  const unsolicited = !fresh && !pending.some((stored) => stored.reportId === part.reportId);
  return unsolicited ? requestInventory(tx, workerId, context) : ok(undefined);
}

// Decision 7, evaluation: after each stored part and each cursor advance,
// in the transaction that caused it.
export async function evaluateSnapshots(
  tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId, context: ReconciliationContext,
): Promise<Result<void>> {
  const parts = await tx.inventoryReports.listByJournal(workerId, journalId);
  if (parts.length === 0) return ok(undefined);
  const journal = await producerJournal(tx, workerId, journalId);
  for (const snapshot of completeSnapshots(parts)) {
    const evaluated = await evaluateSnapshot(tx, snapshot, journal, context);
    if (!evaluated.ok || evaluated.value === 'retired') return evaluated.ok ? ok(undefined) : evaluated;
  }
  return ok(undefined);
}

// Decision 6 before any other rule; then the lower-`snapshot` filter, and
// the snapshot is applied once the cursor reached `throughSequence`.
async function evaluateSnapshot(
  tx: ControlPlaneTransaction, snapshot: InventorySnapshot, journal: ProducerJournal, context: ReconciliationContext,
): Promise<Result<'retired' | 'kept'>> {
  const { workerId, journalId, reportId } = snapshot;
  const current = await tx.inventoryRequests.current(workerId);
  const fresh = isFresh(snapshot, current);
  if (fresh && isRolledBack(snapshot, current?.bound.find((bound) => bound.journalId === journalId))) {
    const retired = await retireJournal(tx, workerId, journalId, 'snapshot-rollback', context);
    return retired.ok ? ok('retired') : retired;
  }
  if (snapshot.snapshot < journal.reportedSnapshot) return keep(await tx.inventoryReports.remove(reportId));
  if (journal.cursor.confirmedThrough < snapshot.throughSequence) return ok('kept');
  const applied = await applySnapshot(tx, snapshot, fresh, context);
  return applied.ok ? keep(await tx.inventoryReports.remove(reportId)) : applied;
}

// Decision 8: only the worker's unfinished assignments it omits change;
// what it reports about executions is not applied.
async function applySnapshot(
  tx: ControlPlaneTransaction, snapshot: InventorySnapshot, fresh: boolean, context: ReconciliationContext,
): Promise<Result<void>> {
  let unclassified = false;
  for (const assignment of await tx.assignments.listUnfinishedByWorker(snapshot.workerId)) {
    if (snapshot.assignmentIds.has(assignment.id)) continue;
    const lost = classifyOmission(snapshot, assignment.acceptance) === 'lost-local-history';
    unclassified ||= !lost;
    const handled = lost
      ? await reconcileLostHistory(tx, assignment, snapshot.reportId, context)
      : await resendIfUngranted(tx, assignment, snapshot.reportId, context);
    if (!handled.ok) return handled;
  }
  return unclassified && !fresh ? requestInventory(tx, snapshot.workerId, context) : ok(undefined);
}

function completeSnapshots(parts: readonly InventoryPart[]): readonly InventorySnapshot[] {
  const reports = new Map<string, InventoryPart[]>();
  for (const part of parts) reports.set(part.reportId, [...(reports.get(part.reportId) ?? []), part]);
  return [...reports.values()].map(assembleSnapshot).filter((snapshot) => snapshot !== undefined);
}

function isFresh(report: { readonly requestId?: string }, current: InventoryRequest | undefined): boolean {
  return report.requestId !== undefined && report.requestId === current?.requestId;
}

async function producerJournal(tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId): Promise<ProducerJournal> {
  const journal = (await tx.cursors.listByWorker(workerId)).find(({ cursor }) => cursor.journalId === journalId);
  return journal ?? { cursor: startProducerCursor(workerId, journalId), reportedSnapshot: 0 };
}

function keep(removed: Result<void>): Result<'kept'> {
  return removed.ok ? ok('kept') : removed;
}
