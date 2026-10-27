import type { LogCorrelation, LogFields, LogValue } from './log-record.js';
import { MARKED_SECRET_RULES, REDACTED, redactWith, SECRET_SEGMENTS, SECRET_SHAPE_RULES } from './redaction-rules.js';

// `promptTokens` is a count, but `accessToken` and `api_key` are dropped.
export function isSecretFieldName(name: string): boolean {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const segments = words.toLowerCase().split(/[^a-z0-9]+/);
  const pairs = segments.slice(1).map((segment, index) => `${segments[index]}${segment}`);
  return [...segments, ...pairs].some((segment) => SECRET_SEGMENTS.has(segment));
}

// Secrets that can hide inside free text, such as a failure message.
const LOG_TEXT_RULES = [...MARKED_SECRET_RULES, ...SECRET_SHAPE_RULES];

export function redactText(text: string): string {
  return redactWith(text, LOG_TEXT_RULES);
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
