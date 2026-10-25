import type { Writable } from 'node:stream';
import type { LogRecord, LogSink } from '@taskelith/observability';

// One JSON object per line, for a collector reading the process output.
// Logging never fails or blocks work, so a record it cannot take is dropped.
export class JsonLinesLogSink implements LogSink {
  readonly #output: Writable;
  #waitingForDrain = false;
  #broken = false;
  #dropped = 0;

  constructor(output: Writable) {
    this.#output = output;
    // Without a listener a failed write would end the process.
    output.on('error', () => this.#break());
  }

  // Records dropped while the output was full or after it failed.
  get dropped(): number {
    return this.#dropped;
  }

  write(record: LogRecord): void {
    if (this.#broken || this.#waitingForDrain) {
      this.#dropped += 1;
      return;
    }
    try {
      const accepted = this.#output.write(`${JSON.stringify(record)}\n`, (error) => {
        if (error) this.#lose();
      });
      if (!accepted) this.#waitForDrain();
    } catch {
      this.#lose();
    }
  }

  #waitForDrain(): void {
    this.#waitingForDrain = true;
    this.#output.once('drain', () => {
      this.#waitingForDrain = false;
    });
  }

  // The `error` event of the same failure only breaks; the write's callback
  // or catch counts the record.
  #lose(): void {
    this.#break();
    this.#dropped += 1;
  }

  #break(): void {
    this.#broken = true;
  }
}
