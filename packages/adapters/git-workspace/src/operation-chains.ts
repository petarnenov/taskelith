// Runs the work of one path one at a time, in the order it arrives.
export class OperationChains {
  readonly #tails = new Map<string, Promise<unknown>>();

  run<T>(path: string, work: () => Promise<T>): Promise<T> {
    const tail = (this.#tails.get(path) ?? Promise.resolve()).then(work, work);
    const release = () => {
      if (this.#tails.get(path) === tail) this.#tails.delete(path);
    };
    this.#tails.set(path, tail);
    void tail.then(release, release);
    return tail;
  }

  // Whether work of `path` runs or waits.
  busy(path: string): boolean {
    return this.#tails.has(path);
  }
}

// Shared by every adapter of the process: per workspace root, so a
// hand-off checks for another and records its own at once, and per workspace.
export const PROCESS_OPERATION_CHAINS = new OperationChains();
