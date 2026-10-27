import {
  REDACTED,
  redactUrlUserinfoEvenEmpty,
  redactWith,
  SECRET_SHAPE_RULES,
  type TextRule,
} from '@taskelith/observability';

export { REDACTED };

// A URL's user information, even empty, then the shapes of trust model 5.
const SECRET_TEXT_RULES = [redactUrlUserinfoEvenEmpty, ...SECRET_SHAPE_RULES];

// Environment variables whose names mark them as secrets.
const SECRET_VARIABLE = /(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|CREDS|SEED|PRIVATE_KEY|API_KEY)/i;

// Each credential revealed to a run, by its exact text, longest first so that
// a credential inside another leaves no part of the longer one visible.
function revealedValueRules(revealed: readonly string[]): TextRule[] {
  const values = revealed.filter((value) => value.length > 0).sort((a, b) => b.length - a.length);
  return values.map((value) => (text: string) => text.split(value).join(REDACTED));
}

// Redacts the credentials revealed to a run, which may have no known shape
// (account pool contract section 7.4), then the installation's shapes.
export function redactSecrets(text: string, revealed: readonly string[] = []): string {
  return redactWith(text, [...revealedValueRules(revealed), ...SECRET_TEXT_RULES]);
}

// Redacts every string of a failure's message and details before it leaves
// the process in an error payload or a log line.
export function redactFailure<T extends { readonly message: string; readonly details: Readonly<Record<string, string>> }>(
  failure: T,
  revealed: readonly string[] = [],
): T {
  const redact = (text: string) => redactSecrets(text, revealed);
  const details = Object.fromEntries(Object.entries(failure.details).map(([key, value]) => [key, redact(value)]));
  return { ...failure, message: redact(failure.message), details };
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
