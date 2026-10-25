import { placementBackoff, type RetryTiming } from '@taskelith/scheduling';

// The clock in epoch milliseconds and the jitter draw in [0, 1), so tests
// control both.
export interface BackoffTiming extends Pick<RetryTiming, 'draw'> {
  now(): number;
}

interface Delay {
  readonly tries: number;
  readonly dueAt: number;
}

// Contract section 5: each consecutive failure of a key delays its next try
// by `placementBackoff`; kept in memory only, so a restart forgets it.
export class RetrySchedule<Key> {
  readonly #timing: BackoffTiming;
  readonly #delays = new Map<Key, Delay>();

  constructor(timing: BackoffTiming) {
    this.#timing = timing;
  }

  due(key: Key): boolean {
    const delay = this.#delays.get(key);
    return delay === undefined || this.#timing.now() >= delay.dueAt;
  }

  notDue(): readonly Key[] {
    return [...this.#delays.keys()].filter((key) => !this.due(key));
  }

  failed(key: Key): void {
    const tries = (this.#delays.get(key)?.tries ?? 0) + 1;
    this.#delays.set(key, { tries, dueAt: this.#timing.now() + placementBackoff(tries, this.#timing.draw()) });
  }

  // Keys whose next try has passed without a new failure.
  pastDue(): readonly Key[] {
    return [...this.#delays.keys()].filter((key) => this.due(key));
  }

  // On a success, or once the key no longer waits; never by age alone.
  forget(key: Key): void {
    this.#delays.delete(key);
  }
}
