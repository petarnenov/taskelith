import type { Instant, Result } from '@taskelith/kernel';
import type { Sequence, SelfCheckResult, WorkerId } from '@taskelith/execution';
import type { WorkerHost } from '../domain/enrollment.js';
import type { WorkerAdmissionDecision, WorkerAdmissionState } from '../domain/worker-admission.js';

// The worker admission that placement reads, and the stored results; both
// write at SERIALIZABLE in the observation consumption transaction.
export interface WorkerAdmissions {
  // Applies only above the worker's self-check fence, which it advances,
  // and replaces the stored results; `not-found` without a worker.
  record(workerId: WorkerId, decision: WorkerAdmissionDecision, sequence: Sequence, at: Instant): Promise<Result<void>>;
  // A new journal incarnation: awaiting, no results, the fence restarted.
  awaitSelfCheck(workerId: WorkerId): Promise<Result<void>>;
}

export interface WorkerAdmissionEntry {
  readonly workerId: WorkerId;
  readonly host: WorkerHost;
  readonly enrolledAt: Instant;
  readonly admission: WorkerAdmissionState;
  readonly reportedAt?: Instant;
  readonly results: readonly SelfCheckResult[];
}

export interface WorkerAdmissionSnapshot {
  readonly asOf: Instant;
  readonly workers: readonly WorkerAdmissionEntry[];
}

// The workers view: every enrolled worker that is not revoked, in
// identifier order, never partial; Access checks the caller first.
export interface WorkerAdmissionView {
  workers(): Promise<Result<WorkerAdmissionSnapshot>>;
}
