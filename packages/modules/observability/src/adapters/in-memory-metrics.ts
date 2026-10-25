import { G2_SIGNALS, type Measurement, type SignalLabels, type SignalName } from '../domain/signals.js';
import type { Metrics } from '../ports/metrics.js';

// The current state of one signal and label set. A gauge's summary is its
// last value; a distribution's covers every sample recorded.
export interface SeriesSummary {
  readonly signal: SignalName;
  readonly labels: SignalLabels;
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly last: number;
}

// Keeps the series in process for a reader such as a test or a drill.
export class InMemoryMetrics implements Metrics {
  readonly #series = new Map<string, SeriesSummary>();

  record(measurement: Measurement): void {
    const key = seriesKey(measurement);
    const previous = this.#series.get(key);
    const gauge = G2_SIGNALS[measurement.signal].kind === 'gauge';
    this.#series.set(key, previous === undefined || gauge ? first(measurement) : added(previous, measurement.value));
  }

  series(name: SignalName, labels: SignalLabels = {}): SeriesSummary | undefined {
    return this.#series.get(seriesKey({ signal: name, labels }));
  }

  snapshot(): readonly SeriesSummary[] {
    return [...this.#series.values()];
  }
}

function seriesKey({ signal, labels }: Pick<Measurement, 'signal' | 'labels'>): string {
  const sorted = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([signal, sorted]);
}

function first({ signal, labels, value }: Measurement): SeriesSummary {
  return Object.freeze({ signal, labels, count: 1, sum: value, min: value, max: value, last: value });
}

function added(summary: SeriesSummary, value: number): SeriesSummary {
  return Object.freeze({
    ...summary,
    count: summary.count + 1,
    sum: summary.sum + value,
    min: Math.min(summary.min, value),
    max: Math.max(summary.max, value),
    last: value,
  });
}
