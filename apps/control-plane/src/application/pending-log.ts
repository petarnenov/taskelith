import type { LogCorrelation, LogFields, Logger } from '@taskelith/observability';

interface PendingWarning {
  readonly correlation: LogCorrelation;
  readonly event: string;
  readonly fields: LogFields;
}

// The warnings of one transaction attempt, written only once it settles, so
// that an attempt rolled back and run again logs nothing twice.
export class PendingLog {
  readonly #warnings: PendingWarning[] = [];

  warn(correlation: LogCorrelation, event: string, fields: LogFields = {}): void {
    this.#warnings.push({ correlation, event, fields });
  }

  writeTo(logger: Logger): void {
    for (const { correlation, event, fields } of this.#warnings) logger.with(correlation).warn(event, fields);
  }
}
