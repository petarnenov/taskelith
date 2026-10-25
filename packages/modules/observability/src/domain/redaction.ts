import type { LogCorrelation, LogFields, LogValue } from './log-record.js';

export const REDACTED = '[redacted]';

// Name segments that may hold a secret value (architecture section 11);
// `promptTokens` is a count, but `accessToken` and `api_key` are dropped.
const SECRET_SEGMENTS = new Set([
  'pass', 'password', 'passwd', 'passphrase', 'pwd', 'secret', 'token', 'credential', 'credentials',
  'authorization', 'cookie', 'privatekey', 'apikey',
]);

// Secrets that can hide inside free text, such as a failure message.
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]+@/gi;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi;
// A libpq-style pair; a quoted value may hold spaces and escaped quotes.
const KEY_VALUE = /\b(password|passwd|pwd|secret|token|api[_-]?key)\s*=\s*('(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?|\S+)/gi;

export function isSecretFieldName(name: string): boolean {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const segments = words.toLowerCase().split(/[^a-z0-9]+/);
  const pairs = segments.slice(1).map((segment, index) => `${segments[index]}${segment}`);
  return [...segments, ...pairs].some((segment) => SECRET_SEGMENTS.has(segment));
}

export function redactText(text: string): string {
  return text
    .replace(URL_USERINFO, `$1${REDACTED}@`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(KEY_VALUE, `$1=${REDACTED}`);
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
