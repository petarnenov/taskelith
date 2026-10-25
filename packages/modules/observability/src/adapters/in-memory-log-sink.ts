import type { LogRecord } from '../domain/log-record.js';
import type { LogSink } from '../ports/log-sink.js';

export class InMemoryLogSink implements LogSink {
  readonly #records: LogRecord[] = [];

  get records(): readonly LogRecord[] {
    return [...this.#records];
  }

  write(record: LogRecord): void {
    this.#records.push(record);
  }
}
