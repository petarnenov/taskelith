// Sleeps that end only when a test lets their time pass, or on abort.
export class ManualTimers {
  readonly #pending = new Set<{ readonly milliseconds: number; readonly resolve: () => void }>();

  readonly sleep = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const entry = { milliseconds, resolve: () => {
      this.#pending.delete(entry);
      signal.removeEventListener('abort', entry.resolve);
      resolve();
    } };
    this.#pending.add(entry);
    signal.addEventListener('abort', entry.resolve, { once: true });
  });

  get waiting(): number[] {
    return [...this.#pending].map(({ milliseconds }) => milliseconds);
  }

  // Ends every sleep of that length; answers how many ended.
  elapse(milliseconds: number): number {
    const due = [...this.#pending].filter((entry) => entry.milliseconds === milliseconds);
    for (const entry of due) entry.resolve();
    return due.length;
  }
}

type Status = { readonly type: string };

// A connection's status events as the test pushes them; `end` closes it.
export class StatusStream implements AsyncIterable<Status> {
  readonly #queued: Status[] = [];
  #waiting: ((result: IteratorResult<Status>) => void) | undefined;
  #ended = false;

  push(type: string): void {
    const waiting = this.#waiting;
    this.#waiting = undefined;
    if (waiting === undefined) this.#queued.push({ type });
    else waiting({ done: false, value: { type } });
  }

  end(): void {
    this.#ended = true;
    this.#waiting?.({ done: true, value: undefined });
    this.#waiting = undefined;
  }

  [Symbol.asyncIterator](): AsyncIterator<Status> {
    return {
      next: () => {
        const queued = this.#queued.shift();
        if (queued !== undefined) return Promise.resolve({ done: false, value: queued });
        if (this.#ended) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => {
          this.#waiting = resolve;
        });
      },
    };
  }
}

// Lets every promise that is already settled run its callbacks.
export async function flush(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}
