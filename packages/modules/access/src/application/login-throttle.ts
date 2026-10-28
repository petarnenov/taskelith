import type { Clock } from '@taskelith/sdlc';

// Provisional values (Q8): after `failures` failed logins of one key within
// the window, each further attempt of that key first waits `delay`.
export interface LoginThrottleSettings {
  readonly failures: number;
  readonly windowMilliseconds: number;
  readonly delayMilliseconds: number;
  // The oldest key is forgotten beyond it, so a flood cannot grow memory.
  readonly maxKeys: number;
}

export const LOGIN_THROTTLE: LoginThrottleSettings = Object.freeze({
  failures: 5, windowMilliseconds: 15 * 60_000, delayMilliseconds: 1_000, maxKeys: 10_000,
});

export interface LoginThrottleDependencies {
  readonly clock: Clock;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly settings?: LoginThrottleSettings;
}

// Slows guessing by login name and by source address; it never locks an
// account, so the right password still logs in after the delay.
export class LoginThrottle {
  readonly #deps: LoginThrottleDependencies;
  readonly #settings: LoginThrottleSettings;
  readonly #failures = new Map<string, number[]>();

  constructor(dependencies: LoginThrottleDependencies) {
    this.#deps = dependencies;
    this.#settings = dependencies.settings ?? LOGIN_THROTTLE;
  }

  async admit(keys: readonly string[]): Promise<void> {
    if (keys.some((key) => this.#recent(key).length >= this.#settings.failures)) {
      await this.#deps.sleep(this.#settings.delayMilliseconds);
    }
  }

  recordFailure(keys: readonly string[]): void {
    const now = this.#now();
    for (const key of keys) {
      const recent = this.#recent(key);
      this.#failures.delete(key);
      this.#failures.set(key, [...recent, now]);
    }
    while (this.#failures.size > this.#settings.maxKeys) this.#failures.delete(this.#failures.keys().next().value!);
  }

  clear(key: string): void {
    this.#failures.delete(key);
  }

  #recent(key: string): number[] {
    const since = this.#now() - this.#settings.windowMilliseconds;
    return (this.#failures.get(key) ?? []).filter((at) => at > since);
  }

  #now(): number {
    return Date.parse(this.#deps.clock.now());
  }
}
