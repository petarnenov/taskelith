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

// The snapshot once every part from 1 to `parts` is present, else undefined.
export function assembleSnapshot(parts: readonly InventoryPart[]): InventorySnapshot | undefined {
  const [first] = parts;
  if (first === undefined) return undefined;
  const numbers = new Set(parts.map((each) => each.part));
  for (let part = 1; part <= first.parts; part += 1) if (!numbers.has(part)) return undefined;
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
