import { err, failure, type Failure, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';

// Provisional values (Q8): after `failures` failed logins of one key within
// the window, each further attempt of that key first waits `delay`.
export interface LoginThrottleSettings {
  readonly failures: number;
  readonly windowMilliseconds: number;
  readonly delayMilliseconds: number;
  // Beyond it a new key is delayed as if throttled until a key expires.
  readonly maxKeys: number;
  // Attempts of one source address waiting or running; more answer 503.
  readonly pendingPerSource: number;
}

export const LOGIN_THROTTLE: LoginThrottleSettings = Object.freeze({
  failures: 5, windowMilliseconds: 15 * 60_000, delayMilliseconds: 1_000, maxKeys: 10_000, pendingPerSource: 4,
});

export interface LoginThrottleDependencies {
  readonly clock: Clock;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly settings?: LoginThrottleSettings;
}

// The two keys an attempt is throttled by.
export interface LoginKeys {
  readonly loginName: string;
  readonly sourceAddress: string;
}

interface KeyQueue {
  pending: number;
  tail: Promise<void>;
}

export function throttleBusy(): Failure {
  return failure('unavailable', 'too many login attempts from this address are waiting');
}

// Slows guessing by login name and by source address; it never locks an
// account, so the right password still logs in after the delay.
export class LoginThrottle {
  readonly #deps: LoginThrottleDependencies;
  readonly #settings: LoginThrottleSettings;
  readonly #failures = new Map<string, number[]>();
  readonly #queues = new Map<string, KeyQueue>();

  constructor(dependencies: LoginThrottleDependencies) {
    this.#deps = dependencies;
    this.#settings = dependencies.settings ?? LOGIN_THROTTLE;
  }

  // Runs the attempt after the earlier ones of its source address and of
  // its login name, one at a time per key, delayed while a key is throttled.
  async attempt<Value>(keys: LoginKeys, work: () => Promise<Result<Value>>): Promise<Result<Value>> {
    const source = sourceKey(keys);
    const name = nameKey(keys);
    if ((this.#queues.get(source)?.pending ?? 0) >= this.#settings.pendingPerSource) return err(throttleBusy());
    const releaseSource = await this.#acquire(source);
    const releaseName = await this.#acquire(name);
    try {
      this.#forgetExpired();
      if (this.#throttled(source) || this.#throttled(name)) await this.#deps.sleep(this.#settings.delayMilliseconds);
      return await work();
    } finally {
      releaseName();
      releaseSource();
    }
  }

  recordFailure(keys: LoginKeys): void {
    const now = this.#now();
    for (const key of [sourceKey(keys), nameKey(keys)]) {
      if (!this.#failures.has(key) && this.#failures.size >= this.#settings.maxKeys) continue;
      const recent = this.#recent(key);
      this.#failures.delete(key);
      this.#failures.set(key, [...recent, now].slice(-this.#settings.failures));
    }
  }

  recordSuccess(keys: LoginKeys): void {
    this.#failures.delete(nameKey(keys));
  }

  // A full table delays every key it cannot hold, so filling it with other
  // names never resets a target's counter.
  #throttled(key: string): boolean {
    if (!this.#failures.has(key) && this.#failures.size >= this.#settings.maxKeys) return true;
    return this.#recent(key).length >= this.#settings.failures;
  }

  // Keys are kept in order of their last failure, so expired ones lead.
  #forgetExpired(): void {
    for (const [key, failures] of this.#failures) {
      if (this.#isRecent(failures.at(-1)!)) return;
      this.#failures.delete(key);
    }
  }

  async #acquire(key: string): Promise<() => void> {
    const queue = this.#queues.get(key) ?? { pending: 0, tail: Promise.resolve() };
    this.#queues.set(key, queue);
    queue.pending += 1;
    const previous = queue.tail;
    let release!: () => void;
    queue.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    return () => {
      queue.pending -= 1;
      if (queue.pending === 0) this.#queues.delete(key);
      release();
    };
  }

  #recent(key: string): number[] {
    return (this.#failures.get(key) ?? []).filter((at) => this.#isRecent(at));
  }

  #isRecent(at: number): boolean {
    return at > this.#now() - this.#settings.windowMilliseconds;
  }

  #now(): number {
    return Date.parse(this.#deps.clock.now());
  }
}

function sourceKey(keys: LoginKeys): string {
  return `source-address:${keys.sourceAddress}`;
}

function nameKey(keys: LoginKeys): string {
  return `login-name:${keys.loginName}`;
}
