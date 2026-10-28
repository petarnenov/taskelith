import { GIT_BUILT_ENVIRONMENT, GIT_CLIENT_PINS, GIT_COMMAND_SCOPE_SETTINGS, GIT_CREDENTIAL_SETTING, GIT_NEUTRAL_DIRECTORY } from '../domain/git-client.js';
import type { WorkspaceCredential } from '../domain/workspace.js';
import { REDACTED_VALUE, redactedHeader, type GitProcessObservation } from './workspace-fixture.js';

// Checks of the Git processes an adapter starts (contract section 7);
// no message holds an argument or value that could carry a credential.

const GIT_OPERATIONS = new Set([
  'cat-file', 'checkout', 'clone', 'config', 'diff', 'fetch', 'init', 'ls-files', 'ls-remote', 'ls-tree',
  'merge-base', 'push', 'read-tree', 'rev-parse', 'status', 'update-index', 'update-ref',
]);
const SENSITIVE_MINIMUM_LENGTH = 8;
// Operations that reach only the remote and so start in no repository.
const NEUTRAL_OPERATIONS = new Set(['clone', 'ls-remote']);
const PINNED_PATHS = new Set<string>(Object.values(GIT_CLIENT_PINS).map(({ path }) => path));
const HEADER_MARKER_PREFIX = redactedHeader('').slice(0, -1);

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

// The secret, the whole Authorization value, its parts after the scheme,
// and their base64 forms: every form a credential can leak in.
export function sensitiveValues(credentials: readonly WorkspaceCredential[]): string[] {
  const forms = credentials.flatMap(({ secret, authorization }) => {
    const parts = [secret, authorization, ...authorization.split(' ').slice(1)];
    return [...parts, ...parts.map(base64)];
  });
  return [...new Set(forms)].filter((form) => form.length >= SENSITIVE_MINIMUM_LENGTH);
}

export function holdsSensitive(text: string, sensitive: readonly string[]): boolean {
  return sensitive.some((value) => text.includes(value));
}

export function redacted(argv: readonly string[], sensitive: readonly string[]): string[] {
  return argv.map((arg) => (holdsSensitive(arg, sensitive) ? REDACTED_VALUE : arg));
}

// The Git subcommand, or `other`, so that a label never echoes input.
export function operationOf(argv: readonly string[]): string {
  return argv.slice(1).find((arg) => GIT_OPERATIONS.has(arg)) ?? 'other';
}

export function processLabel(process: GitProcessObservation): string {
  return `Git process ${process.pid} (${operationOf(process.argv)})`;
}

// The arguments must be exactly `push` and its expected arguments, after
// at most `-C <directory>`.
export function pushArgumentProblems(process: GitProcessObservation, expected: readonly string[], sensitive: readonly string[]): string[] {
  const start = process.argv.indexOf('push');
  const before = process.argv.slice(1, start);
  const prefixAllowed = before.length === 0 || (before.length === 2 && before[0] === '-C');
  const after = process.argv.slice(start);
  if (prefixAllowed && after.length === expected.length && after.every((arg, index) => arg === expected[index])) return [];
  const shown = JSON.stringify(redacted(process.argv.slice(1), sensitive));
  return [`${processLabel(process)}: arguments ${shown}, expected ${JSON.stringify(expected)}`];
}

// What a process may carry: the header of `credentialId` toward the
// remote, or none.
export interface ExpectedGitProcess {
  readonly credentialId: string | null;
}

export function gitProcessProblems(process: GitProcessObservation, expected: ExpectedGitProcess, sensitive: readonly string[]): string[] {
  const label = processLabel(process);
  const problems: string[] = [];
  if (!Number.isSafeInteger(process.pid) || process.pid <= 0) problems.push(`${label}: no process identifier`);
  if (!PINNED_PATHS.has(process.argv[0] ?? '')) problems.push(`${label}: not started through the pinned client's path`);
  if (process.argv.some((arg) => holdsSensitive(arg, sensitive))) problems.push(`${label}: a credential in an argument`);
  if (NEUTRAL_OPERATIONS.has(operationOf(process.argv)) && (process.cwd !== GIT_NEUTRAL_DIRECTORY || process.repositoryConfig !== null)) {
    problems.push(`${label}: needs no checkout but starts in a repository or outside ${GIT_NEUTRAL_DIRECTORY}`);
  }
  problems.push(...environmentProblems(label, process.environment, expected, sensitive));
  return problems;
}

// Exactly the built values and the command-scope settings, the header of
// the expected credential last, and nothing else (contract section 7).
function environmentProblems(label: string, environment: Readonly<Record<string, string>>, expected: ExpectedGitProcess, sensitive: readonly string[]): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(GIT_BUILT_ENVIRONMENT)) {
    if (environment[key] !== value) problems.push(`${label}: ${key} is not "${value}"`);
  }
  const count = Number(environment.GIT_CONFIG_COUNT);
  const indexes = Number.isSafeInteger(count) && count >= 0 ? [...Array(count).keys()] : [];
  const settings = indexes.map((index) => [environment[`GIT_CONFIG_KEY_${index}`], environment[`GIT_CONFIG_VALUE_${index}`]]);
  const header = expected.credentialId === null ? [] : [[GIT_CREDENTIAL_SETTING, redactedHeader(expected.credentialId)]];
  if (JSON.stringify(settings) !== JSON.stringify([...GIT_COMMAND_SCOPE_SETTINGS, ...header])) {
    const keys = settings.map(([key]) => key);
    const whose = expected.credentialId === null ? '' : ` with the header of ${expected.credentialId}`;
    problems.push(`${label}: command-scope settings ${JSON.stringify(keys)} are not the contract's${whose}`);
  }
  const allowed = new Set([...Object.keys(GIT_BUILT_ENVIRONMENT), 'GIT_CONFIG_COUNT', ...indexes.flatMap((index) => [`GIT_CONFIG_KEY_${index}`, `GIT_CONFIG_VALUE_${index}`])]);
  const foreign = Object.keys(environment).filter((key) => !allowed.has(key));
  if (foreign.length > 0) problems.push(`${label}: variables outside the built environment ${JSON.stringify(foreign.sort())}`);
  const headerKey = `GIT_CONFIG_VALUE_${GIT_COMMAND_SCOPE_SETTINGS.length}`;
  const carrying = Object.keys(environment).filter((key) => key !== headerKey && carriesCredential(environment[key]!, sensitive));
  if (carrying.length > 0) problems.push(`${label}: a credential in ${JSON.stringify(carrying.sort())}`);
  return problems;
}

// A redacted value, a header marker, or a credential form the fixture
// left unredacted.
function carriesCredential(value: string, sensitive: readonly string[]): boolean {
  return value === REDACTED_VALUE || value.startsWith(HEADER_MARKER_PREFIX) || holdsSensitive(value, sensitive);
}
