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

// The environment the adapter builds for every Git process, beside the
// command-scope settings; nothing else is inherited (section 7).
export const GIT_BUILT_ENVIRONMENT = Object.freeze({
  PATH: '/usr/bin:/bin',
  HOME: '/nonexistent',
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  // No replace ref an agent made changes the objects that Git reads.
  GIT_NO_REPLACE_OBJECTS: '1',
});

// Command-scope settings of every Git process, in this order; a process
// that reaches the remote adds `http.extraHeader` last.
export const GIT_COMMAND_SCOPE_SETTINGS: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['core.hooksPath', '/dev/null'] as const),
  Object.freeze(['credential.helper', ''] as const),
  Object.freeze(['diff.ignoreSubmodules', 'all'] as const),
  Object.freeze(['status.submoduleSummary', 'false'] as const),
  Object.freeze(['submodule.recurse', 'false'] as const),
  Object.freeze(['fetch.recurseSubmodules', 'false'] as const),
  Object.freeze(['push.recurseSubmodules', 'no'] as const),
  // An untracked cache the agent forged in the index never hides a file.
  Object.freeze(['core.untrackedCache', 'false'] as const),
]);

export const GIT_CREDENTIAL_SETTING = 'http.extraHeader';

// Where a Git process that needs no checkout starts, so that it reads no
// repository's configuration (section 7).
export const GIT_NEUTRAL_DIRECTORY = '/';

// The settings as command-scope environment; the header value is the
// credential's whole Authorization value, never an argument.
export function gitConfigEnvironment(authorization?: string): Record<string, string> {
  const header: [string, string][] = authorization === undefined ? [] : [[GIT_CREDENTIAL_SETTING, `Authorization: ${authorization}`]];
  const settings = [...GIT_COMMAND_SCOPE_SETTINGS, ...header];
  const pairs = settings.flatMap(([key, value], index) => [[`GIT_CONFIG_KEY_${index}`, key], [`GIT_CONFIG_VALUE_${index}`, value]]);
  return { ...GIT_BUILT_ENVIRONMENT, GIT_CONFIG_COUNT: String(settings.length), ...Object.fromEntries(pairs) };
}

// Exact comparison: a newer, older, or patched build is refused.
export function checkGitClient(pin: GitClientPin, reportedVersion: string): Result<void> {
  if (reportedVersion.trim() === pin.version) return ok(undefined);
  return workspaceFailure('precondition-failed', 'git-client-mismatch', `${pin.path} is not ${pin.version}`);
}
