import { monitorEventLoopDelay, type ELDHistogram } from 'node:perf_hooks';
import { measurement, type Metrics } from '@taskelith/observability';

export const EVENT_LOOP_RESOLUTION_MILLISECONDS = 20;

const NANOSECONDS_PER_MILLISECOND = 1e6;

// The part of Node's event-loop delay histogram that the monitor reads.
export type LoopDelayHistogram = Pick<ELDHistogram, 'count' | 'percentile' | 'reset' | 'enable' | 'disable'>;

// Measures the process's event-loop delay with Node's built-in histogram;
// each sample covers the window since the previous one.
export class EventLoopLagMonitor {
  readonly #window: LagWindow;

  constructor(
    resolutionMilliseconds = EVENT_LOOP_RESOLUTION_MILLISECONDS,
    histogram: LoopDelayHistogram = monitorEventLoopDelay({ resolution: resolutionMilliseconds }),
  ) {
    this.#window = new LagWindow(resolutionMilliseconds, histogram);
  }

  sample(metrics: Metrics): void {
    metrics.record(measurement('event-loop.lag', this.#window.p99Milliseconds() / 1000));
    this.#window.restart();
  }

  stop(): void {
    this.#window.stop();
  }
}

// The p99 event-loop delay of the last closed sample window, so a limit
// reads the same value however often it is read.
export class EventLoopLagWindow {
  readonly #window: LagWindow;
  #closedMilliseconds: number | undefined;

  constructor(
    resolutionMilliseconds = EVENT_LOOP_RESOLUTION_MILLISECONDS,
    histogram: LoopDelayHistogram = monitorEventLoopDelay({ resolution: resolutionMilliseconds }),
  ) {
    this.#window = new LagWindow(resolutionMilliseconds, histogram);
  }

  // Ends the open window, whose p99 replaces the last one.
  close(): void {
    this.#closedMilliseconds = this.#window.p99Milliseconds();
    this.#window.restart();
  }

  // Until the first window closes, the open one stands in.
  lagMilliseconds(): number {
    return this.#closedMilliseconds ?? this.#window.p99Milliseconds();
  }

  stop(): void {
    this.#window.stop();
  }
}

// One histogram window. It holds whole timer intervals, so the delay is
// what exceeds the resolution; an empty window has none.
class LagWindow {
  readonly #histogram: LoopDelayHistogram;
  readonly #resolutionMilliseconds: number;

  constructor(resolutionMilliseconds: number, histogram: LoopDelayHistogram) {
    this.#histogram = histogram;
    this.#histogram.enable();
    this.#resolutionMilliseconds = resolutionMilliseconds;
  }

  p99Milliseconds(): number {
    if (this.#histogram.count === 0) return 0;
    const p99 = this.#histogram.percentile(99) / NANOSECONDS_PER_MILLISECOND;
    return Math.max(0, p99 - this.#resolutionMilliseconds);
  }

  restart(): void {
    this.#histogram.reset();
  }

  stop(): void {
    this.#histogram.disable();
  }
}
