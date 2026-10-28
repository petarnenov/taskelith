import { err, failure, type Result } from '@taskelith/kernel';

// At most `concurrent` hashes run at once and `queued` wait; beyond that a
// request is `unavailable`, so a login flood cannot exhaust memory.
export class HashSlots {
  readonly #concurrent: number;
  readonly #queued: number;
  readonly #waiting: Array<() => void> = [];
  #running = 0;

  constructor(concurrent: number, queued: number) {
    this.#concurrent = concurrent;
    this.#queued = queued;
  }

  async run<Value>(work: () => Promise<Result<Value>>): Promise<Result<Value>> {
    if (this.#running >= this.#concurrent) {
      if (this.#waiting.length >= this.#queued) return err(failure('unavailable', 'too many password hashes are waiting'));
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    } else {
      this.#running += 1;
    }
    try {
      return await work();
    } finally {
      const next = this.#waiting.shift();
      if (next === undefined) this.#running -= 1;
      else next();
    }
  }
}
