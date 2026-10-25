import type { Measurement } from '../domain/signals.js';

// Where signal measurements go; an exporter is chosen in a later item.
export interface Metrics {
  record(measurement: Measurement): void;
}

export const NO_METRICS: Metrics = Object.freeze({ record() {} });
