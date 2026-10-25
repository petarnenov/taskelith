import { monitorEventLoopDelay, type ELDHistogram } from 'node:perf_hooks';
import { measurement, type Metrics } from '@taskelith/observability';

export const EVENT_LOOP_RESOLUTION_MILLISECONDS = 20;

const NANOSECONDS_PER_SECOND = 1e9;

// The part of Node's event-loop delay histogram that the monitor reads.
export type LoopDelayHistogram = Pick<ELDHistogram, 'count' | 'percentile' | 'reset' | 'enable' | 'disable'>;

// Measures the process's event-loop delay with Node's built-in histogram;
// each sample covers the window since the previous one.
export class EventLoopLagMonitor {
  readonly #histogram: LoopDelayHistogram;
  readonly #resolutionSeconds: number;

  constructor(
    resolutionMilliseconds = EVENT_LOOP_RESOLUTION_MILLISECONDS,
    histogram: LoopDelayHistogram = monitorEventLoopDelay({ resolution: resolutionMilliseconds }),
  ) {
    this.#histogram = histogram;
    this.#histogram.enable();
    this.#resolutionSeconds = resolutionMilliseconds / 1000;
  }

  // The histogram holds whole timer intervals, so the delay is what exceeds
  // the resolution.
  sample(metrics: Metrics): void {
    const p99 = this.#histogram.count === 0 ? 0 : this.#histogram.percentile(99) / NANOSECONDS_PER_SECOND;
    metrics.record(measurement('event-loop.lag', Math.max(0, p99 - this.#resolutionSeconds)));
    this.#histogram.reset();
  }

  stop(): void {
    this.#histogram.disable();
  }
}
