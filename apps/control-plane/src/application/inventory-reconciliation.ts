import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import {
  assembleSnapshot,
  classifyOmission,
  highestAppliedSequence,
  isFreshReport,
  isRolledBack,
  startProducerCursor,
  supersededReports,
  type InventoryPart,
  type InventorySnapshot,
  type JournalId,
  type ProducerJournal,
  type ReportFreshness,
  type SnapshotAssembly,
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

// Decisions 4, 5 and 7: a fresh request with its bound, appended to the
// worker's command subject; one per worker in a transaction.
export async function requestInventory(tx: ControlPlaneTransaction, workerId: WorkerId, context: ReconciliationContext): Promise<Result<void>> {
  if (context.requested.has(workerId)) return ok(undefined);
  const requestId = context.newRequestId();
  const at = await tx.now();
  const unfinished = await tx.assignments.listUnfinishedByWorker(workerId);
  const journals = await tx.cursors.listByWorker(workerId);
  const bound = journals.map(({ cursor }) => Object.freeze({
    journalId: cursor.journalId,
    sequence: highestAppliedSequence(cursor),
    assignmentIds: unfinished.filter(({ acceptance }) => acceptance?.journalId === cursor.journalId).map(({ id }) => id),
  }));
  const saved = await tx.inventoryRequests.save({ workerId, requestId, requestedAt: at, bound });
  if (!saved.ok) return saved;
  const pruned = await removeReplacedReports(tx, journals, requestId);
  if (!pruned.ok) return pruned;
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

// Decision 7: reports of an earlier request are no longer fresh.
async function removeReplacedReports(tx: ControlPlaneTransaction, journals: readonly ProducerJournal[], requestId: string): Promise<Result<void>> {
  for (const { cursor, reportedSnapshot } of journals) {
    const pending = await tx.inventoryReports.listByJournal(cursor.workerId, cursor.journalId);
    const pruned = await removeSuperseded(tx, pending, { requestId, reportedSnapshot });
    if (!pruned.ok) return pruned;
  }
  return ok(undefined);
}

// Decision 7, receipt: a part that is not fresh, below a snapshot already
// received, is discarded; an unsolicited report requests inventory.
export async function receivePart(tx: ControlPlaneTransaction, part: InventoryPart, context: ReconciliationContext): Promise<Result<void>> {
  const { workerId, journalId } = part;
  const current = await tx.inventoryRequests.current(workerId);
  const fresh = isFreshReport(part, current?.requestId);
  const journal = await producerJournal(tx, workerId, journalId);
  if (!fresh && part.snapshot < journal.reportedSnapshot) return ok(undefined);
  const pending = await tx.inventoryReports.listByJournal(workerId, journalId);
  const added = await tx.inventoryReports.add(part);
  if (!added.ok) return added;
  const raised = await tx.cursors.recordReportedSnapshot(workerId, journalId, part.snapshot);
  if (!raised.ok) return raised;
  const reportedSnapshot = Math.max(journal.reportedSnapshot, part.snapshot);
  const pruned = await removeSuperseded(tx, [...pending, part], { requestId: current?.requestId, reportedSnapshot, preferred: part.reportId });
  if (!pruned.ok) return pruned;
  const unsolicited = !fresh && !pending.some((stored) => stored.reportId === part.reportId);
  return unsolicited ? requestInventory(tx, workerId, context) : ok(undefined);
}

// Decision 7, bound: what is not fresh keeps only its newest report.
async function removeSuperseded(tx: ControlPlaneTransaction, pending: readonly InventoryPart[], freshness: ReportFreshness): Promise<Result<void>> {
  for (const reportId of supersededReports(pending, freshness)) {
    const removed = await tx.inventoryReports.remove(reportId);
    if (!removed.ok) return removed;
  }
  return ok(undefined);
}

// Decision 7, evaluation: after each stored part and each cursor advance,
// in the transaction that caused it; a request may remove a later report.
export async function evaluateSnapshots(
  tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId, context: ReconciliationContext,
): Promise<Result<void>> {
  const parts = await tx.inventoryReports.listByJournal(workerId, journalId);
  if (parts.length === 0) return ok(undefined);
  const journal = await producerJournal(tx, workerId, journalId);
  for (const [reportId, assembly] of assembleReports(parts)) {
    if (assembly === 'incomplete' || !(await isPending(tx, workerId, journalId, reportId))) continue;
    if (assembly === 'inconsistent') {
      const refused = await refuseReport(tx, workerId, journalId, reportId, context);
      if (!refused.ok) return refused;
      continue;
    }
    const evaluated = await evaluateSnapshot(tx, assembly, journal, context);
    if (!evaluated.ok || evaluated.value === 'retired') return evaluated.ok ? ok(undefined) : evaluated;
  }
  return ok(undefined);
}

// Decision 7: parts that disagree are deleted without effect and logged.
async function refuseReport(
  tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId, reportId: string, context: ReconciliationContext,
): Promise<Result<void>> {
  const removed = await tx.inventoryReports.remove(reportId);
  if (removed.ok) context.log.warn({ workerId }, 'execution.inventory.refused', { journalId, reportId, reason: 'inconsistent-parts' });
  return removed;
}

async function isPending(tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId, reportId: string): Promise<boolean> {
  return (await tx.inventoryReports.listByJournal(workerId, journalId)).some((part) => part.reportId === reportId);
}

// Decision 6 before any other rule; then the lower-`snapshot` filter, and
// the snapshot is applied once the cursor reached `throughSequence`.
async function evaluateSnapshot(
  tx: ControlPlaneTransaction, snapshot: InventorySnapshot, journal: ProducerJournal, context: ReconciliationContext,
): Promise<Result<'retired' | 'kept'>> {
  const { workerId, journalId, reportId } = snapshot;
  const current = await tx.inventoryRequests.current(workerId);
  const fresh = isFreshReport(snapshot, current?.requestId);
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

function assembleReports(parts: readonly InventoryPart[]): ReadonlyMap<string, SnapshotAssembly> {
  const reports = new Map<string, InventoryPart[]>();
  for (const part of parts) reports.set(part.reportId, [...(reports.get(part.reportId) ?? []), part]);
  return new Map([...reports].map(([reportId, reportParts]) => [reportId, assembleSnapshot(reportParts)]));
}

async function producerJournal(tx: ControlPlaneTransaction, workerId: WorkerId, journalId: JournalId): Promise<ProducerJournal> {
  const journal = (await tx.cursors.listByWorker(workerId)).find(({ cursor }) => cursor.journalId === journalId);
  return journal ?? { cursor: startProducerCursor(workerId, journalId), reportedSnapshot: 0 };
}

function keep(removed: Result<void>): Result<'kept'> {
  return removed.ok ? ok('kept') : removed;
}
