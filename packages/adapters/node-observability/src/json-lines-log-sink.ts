import type { LogRecord, LogSink } from '@taskelith/observability';

export interface TextOutput {
  write(chunk: string): unknown;
}

// One JSON object per line, for a collector reading the process output.
export class JsonLinesLogSink implements LogSink {
  readonly #output: TextOutput;

  constructor(output: TextOutput) {
    this.#output = output;
  }

  // A record that cannot be written is dropped; logging never fails work.
  write(record: LogRecord): void {
    try {
      this.#output.write(`${JSON.stringify(record)}\n`);
    } catch {
      return;
    }
  }
}
