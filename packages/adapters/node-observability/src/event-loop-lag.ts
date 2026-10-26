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
    this.#window.start();
  }

  // A window without a timer tick records no delay.
  sample(metrics: Metrics): void {
    metrics.record(measurement('event-loop.lag', (this.#window.p99Milliseconds() ?? 0) / 1000));
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
  #closed: { readonly milliseconds: number | undefined } | undefined;

  constructor(
    resolutionMilliseconds = EVENT_LOOP_RESOLUTION_MILLISECONDS,
    histogram: LoopDelayHistogram = monitorEventLoopDelay({ resolution: resolutionMilliseconds }),
  ) {
    this.#window = new LagWindow(resolutionMilliseconds, histogram);
  }

  // Measures from now on; nothing is measured before.
  start(): void {
    this.#window.start();
  }

  // Ends the open window, whose p99 replaces the last one.
  close(): void {
    this.#closed = { milliseconds: this.#window.p99Milliseconds() };
    this.#window.restart();
  }

  // Until the first window closes, the open one stands in; undefined
  // while the window holds no sample.
  lagMilliseconds(): number | undefined {
    return this.#closed === undefined ? this.#window.p99Milliseconds() : this.#closed.milliseconds;
  }

  stop(): void {
    this.#window.stop();
  }
}

// One histogram window. It holds whole timer intervals, so the delay is
// what exceeds the resolution; an empty window measured nothing.
class LagWindow {
  readonly #histogram: LoopDelayHistogram;
  readonly #resolutionMilliseconds: number;

  constructor(resolutionMilliseconds: number, histogram: LoopDelayHistogram) {
    this.#histogram = histogram;
    this.#resolutionMilliseconds = resolutionMilliseconds;
  }

  start(): void {
    this.#histogram.enable();
  }

  p99Milliseconds(): number | undefined {
    if (this.#histogram.count === 0) return undefined;
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
