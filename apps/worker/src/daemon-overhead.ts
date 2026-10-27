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
  // A window that failed to close leaves the lag unmeasured until one does.
  #closeFailure: string | undefined;

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

  // Nothing is measured before the watch starts or without a sample.
  eventLoopLagMilliseconds(): Result<number> {
    if (this.#closeFailure !== undefined) return unmeasuredLag(this.#closeFailure);
    try {
      const lag = this.#window.lagMilliseconds();
      return lag === undefined ? unmeasuredLag('no event-loop delay was sampled') : ok(lag);
    } catch (error) {
      return unmeasuredLag((error as Error).message);
    }
  }

  // The histogram is enabled only while the watch runs, so a start that
  // fails before it holds none.
  async watch(signal: AbortSignal): Promise<void> {
    this.#window.start();
    try {
      while (!signal.aborted) {
        await delay(this.#intervalMilliseconds, undefined, { signal }).catch(() => undefined);
        if (!signal.aborted) this.#closeWindow();
      }
    } finally {
      this.#window.stop();
    }
  }

  #closeWindow(): void {
    try {
      this.#window.close();
      this.#closeFailure = undefined;
    } catch (error) {
      this.#closeFailure = (error as Error).message;
    }
  }
}

function unmeasuredLag(reason: string): Result<number> {
  return err(failure('unavailable', `cannot measure the event-loop delay: ${reason}`));
}
