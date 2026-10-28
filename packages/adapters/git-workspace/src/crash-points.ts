// The lifecycle crash points (contract section 3); tests pass the
// harness's CrashPoints, production none.
export type GitWorkspaceCrashPoint =
  | 'WS1.before' | 'WS1.after'
  | 'WS2.before' | 'WS2.after'
  | 'WS3.before' | 'WS3.after'
  | 'WS4.before' | 'WS4.after'
  | 'WS5.before' | 'WS5.after'
  | 'WS6.before' | 'WS6.after'
  | 'WS7.before' | 'WS7.after'
  | 'WS8.before' | 'WS8' | 'WS8.after'
  | 'WS9.before' | 'WS9.after'
  | 'WS10.before' | 'WS10.after';

export interface CrashPointHook {
  reach(point: GitWorkspaceCrashPoint): void;
}

export const NO_CRASH_POINTS: CrashPointHook = Object.freeze({ reach: () => {} });
