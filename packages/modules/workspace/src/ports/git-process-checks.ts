import { GIT_BUILT_ENVIRONMENT, GIT_COMMAND_SCOPE_SETTINGS, GIT_CREDENTIAL_SETTING } from '../domain/git-client.js';
import type { WorkspaceCredential } from '../domain/workspace.js';
import { REDACTED_VALUE, type GitProcessObservation } from './workspace-fixture.js';

// Checks of the Git processes an adapter starts (contract section 7);
// no message holds an argument or value that could carry a credential.

const GIT_OPERATIONS = new Set([
  'cat-file', 'checkout', 'clone', 'config', 'diff', 'fetch', 'init', 'ls-files', 'ls-remote', 'ls-tree',
  'merge-base', 'push', 'read-tree', 'rev-parse', 'status', 'update-index', 'update-ref',
]);
const SENSITIVE_MINIMUM_LENGTH = 8;

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

export function gitProcessProblems(process: GitProcessObservation, reachesRemote: boolean, sensitive: readonly string[]): string[] {
  const label = processLabel(process);
  const problems: string[] = [];
  if (!Number.isSafeInteger(process.pid) || process.pid <= 0) problems.push(`${label}: no process identifier`);
  if (process.argv.some((arg) => holdsSensitive(arg, sensitive))) problems.push(`${label}: a credential in an argument`);
  problems.push(...environmentProblems(label, process.environment, reachesRemote));
  return problems;
}

// The built values, exactly the command-scope settings, the header only
// toward the remote, and no other Git variable (contract section 7).
function environmentProblems(label: string, environment: Readonly<Record<string, string>>, reachesRemote: boolean): string[] {
  const problems: string[] = [];
  for (const [key, expected] of Object.entries(GIT_BUILT_ENVIRONMENT)) {
    if (environment[key] !== expected) problems.push(`${label}: ${key} is not "${expected}"`);
  }
  const count = Number(environment.GIT_CONFIG_COUNT);
  const indexes = Number.isSafeInteger(count) && count >= 0 ? [...Array(count).keys()] : [];
  const settings = indexes.map((index) => [environment[`GIT_CONFIG_KEY_${index}`], environment[`GIT_CONFIG_VALUE_${index}`]]);
  const header = reachesRemote ? [[GIT_CREDENTIAL_SETTING, REDACTED_VALUE]] : [];
  const expected = [...GIT_COMMAND_SCOPE_SETTINGS, ...header];
  if (JSON.stringify(settings) !== JSON.stringify(expected)) {
    const keys = settings.map(([key]) => key);
    problems.push(`${label}: command-scope settings ${JSON.stringify(keys)} are not the contract's${reachesRemote ? ' with the header' : ''}`);
  }
  const known = new Set([...Object.keys(GIT_BUILT_ENVIRONMENT), 'GIT_CONFIG_COUNT', ...indexes.flatMap((index) => [`GIT_CONFIG_KEY_${index}`, `GIT_CONFIG_VALUE_${index}`])]);
  const foreign = Object.keys(environment).filter((key) => (key.startsWith('GIT_') && !known.has(key)) || key === 'SUDO_UID');
  if (foreign.length > 0) problems.push(`${label}: inherited variables ${JSON.stringify(foreign.sort())}`);
  const redactedKeys = Object.keys(environment).filter((key) => environment[key] === REDACTED_VALUE);
  const headerKey = `GIT_CONFIG_VALUE_${GIT_COMMAND_SCOPE_SETTINGS.length}`;
  const misplaced = redactedKeys.filter((key) => !(reachesRemote && key === headerKey));
  if (misplaced.length > 0) problems.push(`${label}: a credential in ${JSON.stringify(misplaced)}`);
  return problems;
}
