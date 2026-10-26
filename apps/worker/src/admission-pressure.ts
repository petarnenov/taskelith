import { setTimeout as delay } from 'node:timers/promises';
import {
  ADMISSION_PRESSURE_CAUSES,
  type AdmissionPressureCause,
  type OutboxBacklog,
  type WorkerJournal,
} from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { VolumeSpace } from '@taskelith/worker-journal';
import { DAEMON_MEMORY_MEBIBYTES } from './settings.js';

const GIBIBYTE = 2 ** 30;
const MEBIBYTE = 2 ** 20;

// The disk floor, the journal backlog, and the daemon overhead of the
// operational targets.
export interface AdmissionLimits {
  readonly diskFloorBytes: number;
  readonly diskFloorFraction: number;
  readonly backlogEntries: number;
  readonly backlogBytes: number;
  readonly daemonResidentBytes: number;
  readonly eventLoopLagMilliseconds: number;
}

export const ADMISSION_LIMITS: AdmissionLimits = Object.freeze({
  diskFloorBytes: 5 * GIBIBYTE,
  diskFloorFraction: 0.1,
  backlogEntries: 10_000,
  backlogBytes: 256 * MEBIBYTE,
  daemonResidentBytes: DAEMON_MEMORY_MEBIBYTES * MEBIBYTE,
  eventLoopLagMilliseconds: 200,
});

// The worker daemon's own overhead, child processes excluded.
export interface DaemonOverheadSensor {
  residentBytes(): Result<number>;
  // The p99 event-loop delay of the sample window.
  eventLoopLagMilliseconds(): Result<number>;
}

// What one refresh measured; a failure is a limit it could not measure.
export interface PressureReadings {
  readonly space: Result<VolumeSpace>;
  readonly backlog: Result<OutboxBacklog>;
  readonly residentBytes: Result<number>;
  readonly eventLoopLagMilliseconds: Result<number>;
}

export const ADMISSION_PRESSURE_POLL_MILLISECONDS = 5_000;

// What intake and launches ask before they admit new work.
export interface AdmissionCheck {
  // Measures the limits now and reports a change; no cause admits.
  refresh(): Result<readonly AdmissionPressureCause[]>;
}

export interface AdmissionPressureOptions {
  readonly journal: WorkerJournal;
  // The free space of the data root's volume.
  readonly space: () => Result<VolumeSpace>;
  readonly daemon: DaemonOverheadSensor;
  // Empties the buffered stream logs, the only records the floor sheds.
  readonly truncateLogs: () => Result<number>;
  readonly limits?: AdmissionLimits;
  readonly logger?: Logger;
}

// The worker side of capacity reservation section 8: it journals
// `worker.admission-pressure.changed` whenever the causes change.
export class AdmissionPressure implements AdmissionCheck {
  readonly #options: AdmissionPressureOptions;
  readonly #limits: AdmissionLimits;
  readonly #logger: Logger;
  // Unknown until the first report, so each process reports once.
  #reported: string | undefined;

  constructor(options: AdmissionPressureOptions) {
    this.#options = options;
    this.#limits = options.limits ?? ADMISSION_LIMITS;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  refresh(): Result<readonly AdmissionPressureCause[]> {
    const causes = pressureCauses(this.#measure(), this.#limits);
    if (causes.includes('disk-floor')) shedBufferedLogs(this.#options.truncateLogs, this.#logger);
    const reported = this.#report(causes);
    return reported.ok ? ok(causes) : reported;
  }

  // Refreshes at the poll interval until the signal aborts, so a change is
  // reported while no command or launch asks.
  async watch(signal: AbortSignal, pollMilliseconds = ADMISSION_PRESSURE_POLL_MILLISECONDS): Promise<void> {
    while (!signal.aborted) {
      const refreshed = this.refresh();
      if (!refreshed.ok) this.#logger.warn('worker.admission-pressure.unreported', { reason: refreshed.error.message });
      await delay(pollMilliseconds, undefined, { signal }).catch(() => undefined);
    }
  }

  #report(causes: readonly AdmissionPressureCause[]): Result<void> {
    const key = causes.join(',');
    if (key === this.#reported) return ok(undefined);
    const recorded = this.#options.journal.recordAdmissionPressure(causes);
    if (!recorded.ok) return recorded;
    this.#reported = key;
    this.#logger.info('worker.admission-pressure.changed', { causes: key });
    return recorded;
  }

  #measure(): PressureReadings {
    const { space, journal, daemon } = this.#options;
    return {
      space: space(), backlog: journal.backlog(),
      residentBytes: daemon.residentBytes(), eventLoopLagMilliseconds: daemon.eventLoopLagMilliseconds(),
    };
  }
}

// Empties the buffered stream logs, the only records the worker sheds for
// space (worker journal contract section 7), and logs what it did.
export function shedBufferedLogs(truncateLogs: () => Result<number>, logger: Logger): void {
  const truncated = truncateLogs();
  if (!truncated.ok) logger.warn('worker.logs.not-truncated', { reason: truncated.error.message });
  else if (truncated.value > 0) logger.info('worker.logs.truncated', { files: truncated.value });
}

// In contract order; a limit that cannot be measured counts as exceeded.
export function pressureCauses(readings: PressureReadings, limits: AdmissionLimits): AdmissionPressureCause[] {
  const found = new Set([
    diskCause(readings.space, limits),
    backlogCause(readings.backlog, limits),
    aboveLimit(readings.residentBytes, limits.daemonResidentBytes, 'daemon-memory'),
    aboveLimit(readings.eventLoopLagMilliseconds, limits.eventLoopLagMilliseconds, 'event-loop-lag'),
  ]);
  return ADMISSION_PRESSURE_CAUSES.filter((cause) => found.has(cause));
}

// At least 5 GiB or 10% of the volume free, whichever is larger.
function diskCause(space: Result<VolumeSpace>, limits: AdmissionLimits): AdmissionPressureCause | undefined {
  if (!space.ok) return 'unmeasurable-limit';
  const { availableBytes, totalBytes } = space.value;
  const floor = Math.max(limits.diskFloorBytes, totalBytes * limits.diskFloorFraction);
  return availableBytes < floor ? 'disk-floor' : undefined;
}

function backlogCause(backlog: Result<OutboxBacklog>, limits: AdmissionLimits): AdmissionPressureCause | undefined {
  if (!backlog.ok) return 'unmeasurable-limit';
  const { entries, bytes } = backlog.value;
  return entries > limits.backlogEntries || bytes > limits.backlogBytes ? 'journal-backlog' : undefined;
}

// The daemon overhead: at most the limit, as capacity reservation sec. 8.
function aboveLimit(reading: Result<number>, limit: number, cause: AdmissionPressureCause): AdmissionPressureCause | undefined {
  if (!reading.ok) return 'unmeasurable-limit';
  return reading.value > limit ? cause : undefined;
}
