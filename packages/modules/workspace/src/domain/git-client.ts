import { ok, type Result } from '@taskelith/kernel';
import { workspaceFailure } from './workspace.js';

// The Git client the adapter runs: its explicit path from the worker's
// tool manifest and the exact `git --version` output it accepts.
export interface GitClientPin {
  readonly path: string;
  readonly version: string;
}

// The pins of G3 plan D3; Ubuntu's version string omits the package
// revision, so the Linux image pins the package `git=1:2.43.0-1ubuntu7.4`.
export const GIT_CLIENT_PINS = Object.freeze({
  linux: Object.freeze({ path: '/usr/bin/git', version: 'git version 2.43.0' }),
  darwin: Object.freeze({ path: '/usr/bin/git', version: 'git version 2.50.1 (Apple Git-155)' }),
});

// Exact comparison: a newer, older, or patched build is refused.
export function checkGitClient(pin: GitClientPin, reportedVersion: string): Result<void> {
  if (reportedVersion.trim() === pin.version) return ok(undefined);
  return workspaceFailure('precondition-failed', 'git-client-mismatch', `${pin.path} is not ${pin.version}`);
}
