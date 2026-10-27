import {
  pemPrivateKeySpans,
  REDACTED,
  redactUrlUserinfoEvenEmpty,
  redactWith,
  replaceSpans,
  SECRET_SHAPE_RULES,
} from '@taskelith/observability';
import { mergedSpans, revealedSpans } from './revealed-spans.js';

export { REDACTED };

// A URL's user information, even empty, then the shapes of trust model 5.
const SECRET_TEXT_RULES = [redactUrlUserinfoEvenEmpty, ...SECRET_SHAPE_RULES];

// Environment variables whose names mark them as secrets, TLS key files
// included (installation contract section 8).
const SECRET_VARIABLE = /(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|CREDS|SEED|PRIVATE_KEY|API_KEY|TLS_KEY|SSL_KEY)/i;

// Redacts the credentials revealed to a run, which may have no known shape
// (account pool section 7.4), with PEM keys found first, then the shapes.
export function redactSecrets(text: string, revealed: readonly string[] = []): string {
  const spans = mergedSpans([...pemPrivateKeySpans(text), ...revealedSpans(text, revealed, SECRET_TEXT_RULES)]);
  return redactWith(replaceSpans(text, spans, REDACTED), SECRET_TEXT_RULES);
}

// Redacts every string of a failure's message and details before it leaves
// the process in an error payload or a log line.
export function redactFailure<T extends { readonly message: string; readonly details: Readonly<Record<string, string>> }>(
  failure: T,
  revealed: readonly string[] = [],
): T {
  const redact = (text: string) => redactSecrets(text, revealed);
  return { ...failure, message: redact(failure.message), details: redactDetails(failure.details, redact) };
}

// Keys are redacted too; values of keys that become equal are joined in order.
function redactDetails(details: Readonly<Record<string, string>>, redact: (text: string) => string): Record<string, string> {
  const redacted = new Map<string, string>();
  for (const [key, value] of Object.entries(details)) {
    const safeKey = redact(key);
    const earlier = redacted.get(safeKey);
    redacted.set(safeKey, earlier === undefined ? redact(value) : `${earlier}, ${redact(value)}`);
  }
  return Object.fromEntries(redacted);
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
