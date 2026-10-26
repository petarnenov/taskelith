import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { LaunchContact } from './launch-orchestrator.js';

// The provisional lost-contact timeout of the operational targets, which
// the control plane applies to the worker's heartbeats.
export const LOST_CONTACT_MILLISECONDS = 30_000;

export interface WorkerContactOptions {
  // Resolves after the delay, or early once the signal aborts.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  // Ends the lost-contact timer and releases every wait.
  readonly stopping: AbortSignal;
  readonly logger?: Logger;
  readonly lostContactMilliseconds?: number;
}

// The worker's own view of its contact. It is offline from its start until
// a broker connection is up, and once a connection stays down past the
// timeout, until one is up again.
export class WorkerContact implements LaunchContact {
  readonly #options: WorkerContactOptions;
  readonly #logger: Logger;
  readonly #waiting = new Set<() => void>();
  #connected = false;
  #offline = true;
  #lostTimer: AbortController | undefined;

  constructor(options: WorkerContactOptions) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  get connected(): boolean {
    return this.#connected;
  }

  get offline(): boolean {
    return this.#offline;
  }

  linkUp(): void {
    this.#connected = true;
    this.#lostTimer?.abort();
    this.#lostTimer = undefined;
    if (!this.#offline) return;
    this.#offline = false;
    this.#logger.info('worker.contact.online', {});
    for (const release of [...this.#waiting]) release();
  }

  // A link that was not up changes nothing, so the timer starts once.
  linkDown(): void {
    if (!this.#connected) return;
    this.#connected = false;
    const timer = new AbortController();
    this.#lostTimer = timer;
    const signal = AbortSignal.any([timer.signal, this.#options.stopping]);
    const timeout = this.#options.lostContactMilliseconds ?? LOST_CONTACT_MILLISECONDS;
    void this.#options.sleep(timeout, signal).then(() => {
      if (!signal.aborted) this.#lose(timeout);
    });
  }

  // Resolves at once while online, else once online or the signal aborts.
  whenOnline(signal: AbortSignal): Promise<void> {
    if (!this.#offline || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const release = () => {
        this.#waiting.delete(release);
        signal.removeEventListener('abort', release);
        resolve();
      };
      this.#waiting.add(release);
      signal.addEventListener('abort', release, { once: true });
    });
  }

  #lose(timeout: number): void {
    this.#lostTimer = undefined;
    this.#offline = true;
    this.#logger.warn('worker.contact.offline', { afterMilliseconds: timeout });
  }
}
