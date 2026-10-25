import type { Instant } from '@taskelith/kernel';

export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error'] as const);

export type LogLevel = (typeof LOG_LEVELS)[number];

// The identifiers that tie a record to a command, attempt, or event chain;
// architecture section 12 asks for command and attempt correlation.
export const CORRELATION_KEYS = Object.freeze([
  'correlationId',
  'causationId',
  'commandId',
  'attemptId',
  'executionId',
  'assignmentId',
  'taskId',
  'workerId',
  'eventId',
  'observationId',
] as const);

export type CorrelationKey = (typeof CORRELATION_KEYS)[number];

export type LogCorrelation = Readonly<Partial<Record<CorrelationKey, string>>>;

export type LogValue = string | number | boolean;

export type LogFields = Readonly<Record<string, LogValue>>;

// One structured log record. `event` is a stable dotted name, such as
// `nats.message.quarantined`, that readers filter by.
export interface LogRecord {
  readonly at: Instant;
  readonly level: LogLevel;
  readonly event: string;
  readonly correlation: LogCorrelation;
  readonly fields: LogFields;
}

// Keeps only the known keys whose values are strings, so a correlation read
// from a received message cannot carry anything else into a record.
export function pickCorrelation(source: Readonly<Record<string, unknown>>): LogCorrelation {
  const picked: Partial<Record<CorrelationKey, string>> = {};
  for (const key of CORRELATION_KEYS) {
    const value = source[key];
    if (typeof value === 'string') picked[key] = value;
  }
  return Object.freeze(picked);
}
