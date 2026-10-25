import type { LogCorrelation, LogFields, LogValue } from './log-record.js';

export const REDACTED = '[redacted]';

// Field names that may hold a secret value (architecture section 11); the
// value is dropped whatever it is.
const SECRET_FIELD = /pass(word|phrase)?|secret|token|credential|authori[sz]ation|cookie|private.?key|api.?key/i;

// Secrets that can hide inside free text, such as a failure message.
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]+@/gi;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function isSecretFieldName(name: string): boolean {
  return SECRET_FIELD.test(name);
}

export function redactText(text: string): string {
  return text.replace(URL_USERINFO, `$1${REDACTED}@`).replace(BEARER, `Bearer ${REDACTED}`);
}

export function redactFields(fields: LogFields): LogFields {
  const redacted: Record<string, LogValue> = {};
  for (const [name, value] of Object.entries(fields)) {
    redacted[name] = isSecretFieldName(name) ? REDACTED : redactValue(value);
  }
  return Object.freeze(redacted);
}

export function redactCorrelation(correlation: LogCorrelation): LogCorrelation {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(correlation)) {
    if (value !== undefined) redacted[key] = redactText(value);
  }
  return Object.freeze(redacted);
}

function redactValue(value: LogValue): LogValue {
  return typeof value === 'string' ? redactText(value) : value;
}
