import { monitorEventLoopDelay, type ELDHistogram } from 'node:perf_hooks';
import { measurement, type Metrics } from '@taskelith/observability';

export const EVENT_LOOP_RESOLUTION_MILLISECONDS = 20;

const NANOSECONDS_PER_SECOND = 1e9;

// Measures the process's event-loop delay with Node's built-in histogram;
// each sample covers the window since the previous one.
export class EventLoopLagMonitor {
  readonly #histogram: ELDHistogram;

  constructor(resolutionMilliseconds = EVENT_LOOP_RESOLUTION_MILLISECONDS) {
    this.#histogram = monitorEventLoopDelay({ resolution: resolutionMilliseconds });
    this.#histogram.enable();
  }

  sample(metrics: Metrics): void {
    const p99 = this.#histogram.count === 0 ? 0 : this.#histogram.percentile(99) / NANOSECONDS_PER_SECOND;
    metrics.record(measurement('event-loop.lag', p99));
    this.#histogram.reset();
  }

  stop(): void {
    this.#histogram.disable();
  }
}
