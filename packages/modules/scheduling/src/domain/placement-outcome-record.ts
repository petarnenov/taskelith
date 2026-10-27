import type { AttemptId } from '@taskelith/execution';
import type { Instant } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import { NO_CANDIDATE_REASON, WAITING_REASONS, type RejectingReason, type WaitingReason } from './capacity-reasons.js';

// Contract section 11, "Recorded outcome": the party that raised the reason.
export const OUTCOME_SOURCES = Object.freeze(['scheduler'] as const);

export const OUTCOME_DISPOSITIONS = Object.freeze(['waiting', 'rejected'] as const);

export type OutcomeSource = (typeof OUTCOME_SOURCES)[number];
export type OutcomeDisposition = (typeof OUTCOME_DISPOSITIONS)[number];
export type RecordedWaitingReason = WaitingReason | typeof NO_CANDIDATE_REASON;

// A task's last placement try that did not place it. The attempt is absent
// when the try opened it and the rollback removed it.
export type PlacementOutcomeRecord = OutcomeValues & (
  | { readonly disposition: 'waiting'; readonly reason: RecordedWaitingReason }
  | { readonly disposition: 'rejected'; readonly reason: RejectingReason }
);

export interface OutcomeValues {
  readonly taskId: TaskId;
  readonly attemptId?: AttemptId;
  readonly source: OutcomeSource;
  // The database clock when the record was written.
  readonly recordedAt: Instant;
}

// Takes any value, since failure details carry the reason untyped.
export function isRecordedWaitingReason(reason: unknown): reason is RecordedWaitingReason {
  return reason === NO_CANDIDATE_REASON || (WAITING_REASONS as readonly unknown[]).includes(reason);
}
