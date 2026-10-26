// Tasks that end together: the first failure aborts the group's signal,
// and `settled` waits for every task before it rethrows that failure.
export class TaskGroup {
  readonly signal: AbortSignal;
  readonly #failed = new AbortController();
  // Only the running tasks, so a long-lived group retains no ended one.
  readonly #running = new Set<Promise<void>>();
  #failure: { readonly error: unknown } | undefined;

  constructor(signal: AbortSignal) {
    this.signal = AbortSignal.any([signal, this.#failed.signal]);
  }

  get running(): number {
    return this.#running.size;
  }

  add(task: Promise<void>): void {
    const tracked: Promise<void> = task.catch((error: unknown) => {
      this.#failure ??= { error };
      this.#failed.abort();
    }).finally(() => this.#running.delete(tracked));
    this.#running.add(tracked);
  }

  // Also waits for the tasks added while it waits.
  async settled(): Promise<void> {
    while (this.#running.size > 0) await Promise.all(this.#running);
    if (this.#failure !== undefined) throw this.#failure.error;
  }
}

// Runs each task under one signal, as a group.
export async function runTogether(signal: AbortSignal, tasks: ReadonlyArray<(signal: AbortSignal) => Promise<void>>): Promise<void> {
  const group = new TaskGroup(signal);
  for (const task of tasks) group.add(task(group.signal));
  await group.settled();
}
