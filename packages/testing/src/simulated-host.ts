import { instantFromEpochMilliseconds, type Instant } from '@taskelith/kernel';

export interface WallClock {
  now(): Instant;
}

export interface MonotonicClock {
  readMilliseconds(): number;
}

// One simulated machine. Its deadline clock counts suspended time, as Linux
// CLOCK_BOOTTIME does; its uptime clock stops, as CLOCK_MONOTONIC does.
export class SimulatedHost {
  readonly wallClock: WallClock = { now: () => this.#wallInstant() };
  readonly deadlineClock: MonotonicClock = { readMilliseconds: () => this.#awake + this.#asleep };
  readonly uptimeClock: MonotonicClock = { readMilliseconds: () => this.#awake };
  #wall: number;
  #awake = 0;
  #asleep = 0;

  constructor(start: Instant) {
    this.#wall = Date.parse(start);
  }

  elapse(milliseconds: number): void {
    assertDuration(milliseconds);
    this.#wall += milliseconds;
    this.#awake += milliseconds;
  }

  suspend(milliseconds: number): void {
    assertDuration(milliseconds);
    this.#wall += milliseconds;
    this.#asleep += milliseconds;
  }

  // A wall clock set wrong or stepped by NTP; the monotonic clocks ignore it.
  shiftWallClock(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds)) throw new RangeError(`Wall clock shift must be a safe integer, got ${milliseconds}`);
    this.#wall += milliseconds;
  }

  #wallInstant(): Instant {
    const instant = instantFromEpochMilliseconds(this.#wall);
    if (!instant.ok) throw new RangeError(instant.error.message);
    return instant.value;
  }
}

function assertDuration(milliseconds: number): void {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new RangeError(`Duration must be a non-negative safe integer, got ${milliseconds}`);
  }
}
