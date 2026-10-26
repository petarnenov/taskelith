// Tasks that end together: the first failure aborts the group's signal,
// and `settled` waits for every task before it rethrows that failure.
export class TaskGroup {
  readonly signal: AbortSignal;
  readonly #failed = new AbortController();
  readonly #tasks: Array<Promise<void>> = [];
  #failure: { readonly error: unknown } | undefined;

  constructor(signal: AbortSignal) {
    this.signal = AbortSignal.any([signal, this.#failed.signal]);
  }

  add(task: Promise<void>): void {
    this.#tasks.push(task.catch((error: unknown) => {
      this.#failure ??= { error };
      this.#failed.abort();
    }));
  }

  // Also waits for the tasks added while it waits.
  async settled(): Promise<void> {
    for (let awaited = 0; awaited < this.#tasks.length;) {
      awaited = this.#tasks.length;
      await Promise.allSettled(this.#tasks);
    }
    if (this.#failure !== undefined) throw this.#failure.error;
  }
}

// Runs each task under one signal, as a group.
export async function runTogether(signal: AbortSignal, tasks: ReadonlyArray<(signal: AbortSignal) => Promise<void>>): Promise<void> {
  const group = new TaskGroup(signal);
  for (const task of tasks) group.add(task(group.signal));
  await group.settled();
}
