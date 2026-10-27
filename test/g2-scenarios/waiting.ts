import { setTimeout as delay } from 'node:timers/promises';

const POLL_MILLISECONDS = 50;
// Longer than any hold of a scenario, shorter than its test timeout.
export const GATE_MILLISECONDS = 60_000;

// Polls until the condition holds; the failure names what was awaited.
export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMilliseconds = 20_000, awaited = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`${awaited} not met within ${timeoutMilliseconds} ms`);
    await delay(POLL_MILLISECONDS);
  }
}

// Settles as the promise does, or fails naming what did not settle in time.
export function within<T>(promise: Promise<T>, milliseconds: number, awaited: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${awaited} did not settle within ${milliseconds} ms`)), milliseconds);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

// An ordering point a scenario opens: what awaits it waits until then.
export class Gate {
  readonly #opened: Promise<void>;
  #open!: () => void;
  #isOpen = false;

  constructor() {
    this.#opened = new Promise((resolve) => { this.#open = resolve; });
  }

  get isOpen(): boolean {
    return this.#isOpen;
  }

  open(): void {
    this.#isOpen = true;
    this.#open();
  }

  // Resolves once opened; a gate that is never opened fails by name.
  wait(awaited: string, milliseconds = GATE_MILLISECONDS): Promise<void> {
    return within(this.#opened, milliseconds, awaited);
  }
}
