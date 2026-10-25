import type { Instant } from '@taskelith/kernel';
import type { AssignmentId, WorkerId } from './identifiers.js';
import type { JournalId, ProducerCursor, Sequence } from './observation-sequence.js';

// What one part of an inventory snapshot reports, as the control plane keeps
// it until the snapshot can be applied (wire contracts section 6).
export interface InventoryPart {
  readonly reportId: string;
  readonly part: number;
  readonly parts: number;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly requestId?: string;
  readonly snapshot: number;
  readonly throughSequence: number;
  readonly assignments: readonly ReportedAssignment[];
  readonly executions: readonly ReportedExecution[];
}

export interface ReportedAssignment {
  readonly commandId: string;
  readonly assignmentId: string;
  readonly attemptId: string;
  readonly ownershipGeneration: number;
  readonly state: string;
}

export interface ReportedExecution {
  readonly executionId: string;
  readonly assignmentId: string;
  readonly state: string;
  readonly uncertain: boolean;
}

// Every part of one report, assembled; only the listed assignments count.
export interface InventorySnapshot {
  readonly reportId: string;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly requestId?: string;
  readonly snapshot: number;
  readonly throughSequence: number;
  readonly assignmentIds: ReadonlySet<string>;
}

// The journal and sequence an assignment's acceptance was applied from.
export interface AcceptanceProvenance {
  readonly journalId: JournalId;
  readonly sequence: Sequence;
}

// What the control plane had applied from one journal when it requested
// inventory: its highest sequence and the unfinished assignments accepted.
export interface JournalBound {
  readonly journalId: JournalId;
  readonly sequence: number;
  readonly assignmentIds: readonly AssignmentId[];
}

// The latest inventory request of a worker, which alone is current.
export interface InventoryRequest {
  readonly workerId: WorkerId;
  readonly requestId: string;
  readonly requestedAt: Instant;
  readonly bound: readonly JournalBound[];
}

// `lost-local-history` is proven; `unclassified` may be an offer that the
// worker had not received yet.
export type OmissionClass = 'lost-local-history' | 'unclassified';

// `inconsistent`: its parts disagree on a field every part repeats, or one
// lies outside 1 to `parts`; such a report can never be applied.
export type SnapshotAssembly = InventorySnapshot | 'incomplete' | 'inconsistent';

// The snapshot once every part from 1 to `parts` is present.
export function assembleSnapshot(parts: readonly InventoryPart[]): SnapshotAssembly {
  const [first] = parts;
  if (first === undefined) return 'incomplete';
  const common = commonFieldsOf(first);
  if (parts.some((each) => commonFieldsOf(each) !== common || each.part < 1 || each.part > first.parts)) return 'inconsistent';
  if (new Set(parts.map((each) => each.part)).size < first.parts) return 'incomplete';
  return Object.freeze({
    reportId: first.reportId,
    workerId: first.workerId,
    journalId: first.journalId,
    ...(first.requestId === undefined ? {} : { requestId: first.requestId }),
    snapshot: first.snapshot,
    throughSequence: first.throughSequence,
    assignmentIds: new Set(parts.flatMap((each) => each.assignments.map((assignment) => assignment.assignmentId))),
  });
}

function commonFieldsOf({ reportId, parts, workerId, journalId, requestId, snapshot, throughSequence }: InventoryPart): string {
  return JSON.stringify([reportId, parts, workerId, journalId, requestId ?? null, snapshot, throughSequence]);
}

// What decides which pending reports survive: the current request, the
// journal's highest received `snapshot`, and the report that wins a tie.
export interface ReportFreshness {
  readonly requestId: string | undefined;
  readonly highestSnapshot: number;
  readonly preferred?: string;
}

// Only the newest fresh report and the newest one not fresh survive; the
// latter only while it is not below the journal's highest `snapshot`.
export function supersededReports(pending: readonly InventoryPart[], freshness: ReportFreshness): ReadonlySet<string> {
  const fresh = new Map<string, number>();
  const stale = new Map<string, number>();
  for (const part of pending) (isFreshReport(part, freshness.requestId) ? fresh : stale).set(part.reportId, part.snapshot);
  const newestFresh = newestReport(fresh, freshness.preferred);
  const newestStale = newestReport(stale, freshness.preferred);
  const superseded = [
    ...[...fresh.keys()].filter((reportId) => reportId !== newestFresh),
    ...[...stale].filter(([reportId, snapshot]) => reportId !== newestStale || snapshot < freshness.highestSnapshot).map(([reportId]) => reportId),
  ];
  return new Set(superseded);
}

// The highest `snapshot` received from a journal: of a complete report, or
// of a part still pending, whose stored siblings agree with it.
export function highestReceivedSnapshot(reportedSnapshot: number, pending: readonly InventoryPart[]): number {
  return Math.max(reportedSnapshot, ...pending.map((part) => part.snapshot));
}

// A report is fresh when it answers the worker's current request.
export function isFreshReport(report: { readonly requestId?: string }, currentRequestId: string | undefined): boolean {
  return report.requestId !== undefined && report.requestId === currentRequestId;
}

// The highest `snapshot`; a tie goes to `preferred`, else the last report.
function newestReport(snapshots: ReadonlyMap<string, number>, preferred: string | undefined): string | undefined {
  const preference = (reportId: string) => (reportId === preferred ? 1 : 0);
  const ranked = [...snapshots].sort(([leftId, left], [rightId, right]) =>
    left - right || preference(leftId) - preference(rightId) || (leftId < rightId ? -1 : 1));
  return ranked.at(-1)?.[0];
}

// The larger of the confirmed prefix and the highest sequence above it.
export function highestAppliedSequence(cursor: ProducerCursor): number {
  return Math.max(cursor.confirmedThrough, ...cursor.appliedAbove);
}

// Only a fresh snapshot is checked: below its journal's bound, or omitting
// an assignment the bound lists, it proves a rollback.
export function isRolledBack(snapshot: InventorySnapshot, bound: JournalBound | undefined): boolean {
  if (bound === undefined) return false;
  if (snapshot.throughSequence < bound.sequence) return true;
  return bound.assignmentIds.some((assignmentId) => !snapshot.assignmentIds.has(assignmentId));
}

// An omission proves lost local history only for an acceptance applied from
// the snapshot's journal up to `throughSequence`, or from an earlier journal.
export function classifyOmission(snapshot: InventorySnapshot, acceptance: AcceptanceProvenance | undefined): OmissionClass {
  if (acceptance === undefined) return 'unclassified';
  if (acceptance.journalId !== snapshot.journalId) return 'lost-local-history';
  return acceptance.sequence <= snapshot.throughSequence ? 'lost-local-history' : 'unclassified';
}
