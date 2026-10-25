import { SECRET_PREFIXES } from './node-secrets.js';

export const REDACTED = '[redacted]';

// Secrets that text may carry: this installation's bearer secrets, NATS seeds
// and user JWTs, and a whole `.creds` block (trust model section 5).
const SECRET_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b(?:${Object.values(SECRET_PREFIXES).join('|')})_[A-Za-z0-9_-]{20,}`, 'g'),
  /-----BEGIN NATS USER JWT-----[\s\S]*?------END USER NKEY SEED------/g,
  /\bS[OAU][A-Z2-7]{56}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

// Environment variables whose names mark them as secrets.
const SECRET_VARIABLE = /(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|CREDS|SEED|PRIVATE_KEY|API_KEY)/i;

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, REDACTED), text);
}

// Redacts every string of a failure's message and details before it leaves
// the process in an error payload or a log line.
export function redactFailure<T extends { readonly message: string; readonly details: Readonly<Record<string, string>> }>(failure: T): T {
  const details = Object.fromEntries(Object.entries(failure.details).map(([key, value]) => [key, redactSecrets(value)]));
  return { ...failure, message: redactSecrets(failure.message), details };
}

// The environment a child process gets: no variable named like a secret, and
// no value that holds one.
export function scrubEnvironment(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined || SECRET_VARIABLE.test(name) || redactSecrets(value) !== value) continue;
    kept[name] = value;
  }
  return kept;
}
