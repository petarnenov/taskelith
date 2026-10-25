import type { LogRecord } from '../domain/log-record.js';

// Where structured records go. A sink must not throw into its caller; one
// that cannot write drops the record.
export interface LogSink {
  write(record: LogRecord): void;
}

export const NO_LOGS: LogSink = Object.freeze({ write() {} });
