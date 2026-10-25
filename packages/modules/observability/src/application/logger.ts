import type { Instant } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import type { LogCorrelation, LogFields, LogLevel } from '../domain/log-record.js';
import { redactCorrelation, redactFields } from '../domain/redaction.js';
import { NO_LOGS, type LogSink } from '../ports/log-sink.js';

// Writes redacted, correlated records to a sink. `with` returns a logger
// whose records also carry the given correlation.
export class Logger {
  readonly #sink: LogSink;
  readonly #clock: Clock;
  readonly #correlation: LogCorrelation;

  constructor(sink: LogSink, clock: Clock, correlation: LogCorrelation = {}) {
    this.#sink = sink;
    this.#clock = clock;
    this.#correlation = redactCorrelation(correlation);
  }

  with(correlation: LogCorrelation): Logger {
    return new Logger(this.#sink, this.#clock, { ...this.#correlation, ...correlation });
  }

  debug(event: string, fields: LogFields = {}): void {
    this.#write('debug', event, fields);
  }

  info(event: string, fields: LogFields = {}): void {
    this.#write('info', event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.#write('warn', event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.#write('error', event, fields);
  }

  #write(level: LogLevel, event: string, fields: LogFields): void {
    this.#sink.write(Object.freeze({
      at: this.#clock.now(),
      level,
      event,
      correlation: this.#correlation,
      fields: redactFields(fields),
    }));
  }
}

const EPOCH = '1970-01-01T00:00:00.000Z' as Instant;

// The default of a component given no logger; its records go nowhere.
export const SILENT_LOGGER = new Logger(NO_LOGS, { now: () => EPOCH });
