// The lifecycle crash points that the local operations reach (contract
// section 3); tests pass the harness's CrashPoints, production none.
export type GitWorkspaceCrashPoint =
  | 'WS1.before' | 'WS1.after'
  | 'WS2.before' | 'WS2.after'
  | 'WS3.before' | 'WS3.after'
  | 'WS4.before' | 'WS4.after';

export interface CrashPointHook {
  reach(point: GitWorkspaceCrashPoint): void;
}

export const NO_CRASH_POINTS: CrashPointHook = Object.freeze({ reach: () => {} });
