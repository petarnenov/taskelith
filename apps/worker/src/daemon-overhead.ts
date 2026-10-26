import { setTimeout as delay } from 'node:timers/promises';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { EventLoopLagWindow, SAMPLE_INTERVAL_MILLISECONDS } from '@taskelith/node-observability';
import type { DaemonOverheadSensor } from './admission-pressure.js';

// A sensor whose readings need a running sampler.
export interface DaemonOverheadSource extends DaemonOverheadSensor {
  // Samples until the signal aborts, then releases what it holds.
  watch(signal: AbortSignal): Promise<void>;
}

// The worker process itself: its resident set and its event-loop delay
// over the sample window of the operational targets, section 4.
export class ProcessDaemonOverhead implements DaemonOverheadSource {
  readonly #window: EventLoopLagWindow;
  readonly #resident: () => number;
  readonly #intervalMilliseconds: number;

  constructor(
    window = new EventLoopLagWindow(),
    resident: () => number = () => process.memoryUsage.rss(),
    intervalMilliseconds = SAMPLE_INTERVAL_MILLISECONDS,
  ) {
    this.#window = window;
    this.#resident = resident;
    this.#intervalMilliseconds = intervalMilliseconds;
  }

  residentBytes(): Result<number> {
    try {
      return ok(this.#resident());
    } catch (error) {
      return err(failure('unavailable', `cannot read the resident set size: ${(error as Error).message}`));
    }
  }

  eventLoopLagMilliseconds(): Result<number> {
    return ok(this.#window.lagMilliseconds());
  }

  async watch(signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        await delay(this.#intervalMilliseconds, undefined, { signal }).catch(() => undefined);
        if (!signal.aborted) this.#window.close();
      }
    } finally {
      this.#window.stop();
    }
  }
}
