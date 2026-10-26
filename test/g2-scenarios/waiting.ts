import { setTimeout as delay } from 'node:timers/promises';

const POLL_MILLISECONDS = 50;

// Polls until the condition holds; the failure names what was awaited.
export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMilliseconds = 20_000, awaited = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`${awaited} not met within ${timeoutMilliseconds} ms`);
    await delay(POLL_MILLISECONDS);
  }
}

// An ordering point a scenario opens: what awaits it waits until then.
export class Gate {
  readonly opened: Promise<void>;
  #open!: () => void;
  #isOpen = false;

  constructor() {
    this.opened = new Promise((resolve) => { this.#open = resolve; });
  }

  get isOpen(): boolean {
    return this.#isOpen;
  }

  open(): void {
    this.#isOpen = true;
    this.#open();
  }
}
