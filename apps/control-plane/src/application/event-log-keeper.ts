import type { UiEventLog, ViewPositions } from '@taskelith/execution';
import { instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';
import type { Scheduler } from './event-stream-hub.js';

// Provisional, in docs/operational-targets.md: entries numbered or pruned
// per statement, and how long a numbered entry stays in the log by default.
export const NUMBERING_BATCH = 1_000;
export const PRUNING_BATCH = 10_000;
export const DEFAULT_EVENT_RETENTION_HOURS = 24;
const HOUR_MILLISECONDS = 3_600_000;

export interface EventLogKeeperDependencies {
  readonly log: Pick<UiEventLog, 'assign' | 'prune'>;
  readonly clock: { now(): Instant };
  readonly retentionHours?: number;
}

// The position assigner and the retention job of the event log.
export class EventLogKeeper {
  readonly #dependencies: EventLogKeeperDependencies;

  constructor(dependencies: EventLogKeeperDependencies) {
    this.#dependencies = dependencies;
  }

  // Numbers every entry committed so far, a batch at a time; answers how
  // many it numbered.
  async numberCommitted(): Promise<Result<number>> {
    let total = 0;
    for (;;) {
      const numbered = await this.#dependencies.log.assign(NUMBERING_BATCH, this.#dependencies.clock.now());
      if (!numbered.ok) return numbered;
      total += numbered.value;
      if (numbered.value < NUMBERING_BATCH) return ok(total);
    }
  }

  // Removes the entries numbered before the retention window; answers the
  // raised floor.
  prune(): Promise<Result<number>> {
    const hours = this.#dependencies.retentionHours ?? DEFAULT_EVENT_RETENTION_HOURS;
    const cutoff = instantFromEpochMilliseconds(Date.parse(this.#dependencies.clock.now()) - hours * HOUR_MILLISECONDS);
    if (!cutoff.ok) return Promise.resolve(cutoff);
    return this.#dependencies.log.prune(cutoff.value, PRUNING_BATCH);
  }
}

export interface NumberingPassParts {
  readonly keeper: Pick<EventLogKeeper, 'numberCommitted'>;
  readonly wakeUps: { listen(): Promise<boolean> };
  readonly streams: { wake(): void };
  readonly logger: Logger;
}

// One run of the numbering loop. The wake-up connection opens beside it,
// so one that stalls never holds the poll.
export async function numberingPass({ keeper, wakeUps, streams, logger }: NumberingPassParts): Promise<void> {
  void wakeUps.listen();
  const numbered = await keeper.numberCommitted();
  if (!numbered.ok) logger.warn('events.numbering.failed', { code: numbered.error.code, message: numbered.error.message });
  streams.wake();
}

// A view's position is the log's head when the read starts: what the view
// shows includes every entry at or before it (wire contracts section 10).
export class LogViewPositions implements ViewPositions {
  readonly #log: Pick<UiEventLog, 'bounds'>;

  constructor(log: Pick<UiEventLog, 'bounds'>) {
    this.#log = log;
  }

  async current(): Promise<Result<string>> {
    const bounds = await this.#log.bounds();
    return bounds.ok ? ok(String(bounds.value.head)) : bounds;
  }
}

// Runs its work again whenever woken, and at least every poll interval,
// until the signal aborts; a wake during the work runs it once more.
export class WakeableLoop {
  readonly #scheduler: Scheduler;
  #woken = false;
  #resume: (() => void) | undefined;

  constructor(scheduler: Scheduler) {
    this.#scheduler = scheduler;
  }

  wake(): void {
    this.#woken = true;
    this.#resume?.();
  }

  async run(work: () => Promise<void>, signal: AbortSignal, pollMilliseconds: number): Promise<void> {
    while (!signal.aborted) {
      this.#woken = false;
      await work();
      if (!this.#woken) await this.#pause(signal, pollMilliseconds);
    }
  }

  #pause(signal: AbortSignal, milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const resume = () => {
        cancel();
        signal.removeEventListener('abort', resume);
        this.#resume = undefined;
        resolve();
      };
      const cancel = this.#scheduler.after(milliseconds, resume);
      this.#resume = resume;
      signal.addEventListener('abort', resume, { once: true });
      if (signal.aborted) resume();
    });
  }
}
