// The adapter's named crash points; tests pass the harness's CrashPoints,
// and production passes NO_CRASH_POINTS.
export type PostgresCrashPoint =
  | 'OutboxCommit.before' | 'OutboxCommit.after'
  | 'InboxCommit.before' | 'InboxCommit.after'
  | 'OutboxPublish.before' | 'OutboxPublish.after';

export interface CrashPointHook {
  reach(point: PostgresCrashPoint): void;
}

export const NO_CRASH_POINTS: CrashPointHook = Object.freeze({ reach: () => {} });
