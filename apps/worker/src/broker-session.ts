import { launchRetryDelay } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { WorkerContact } from './worker-contact.js';

// One broker connection as the worker watches it.
export interface BrokerLink {
  // `disconnect` and `reconnect` change contact; it ends with the link.
  readonly statuses: AsyncIterable<{ readonly type: string }>;
  close(): Promise<void>;
}

export interface BrokerSessionOptions<Link extends BrokerLink> {
  readonly connect: () => Promise<Result<Link>>;
  // The work of one connection, until the signal aborts.
  readonly serve: (link: Link, signal: AbortSignal) => Promise<void>;
  // Each time the link is up, until it is down again.
  readonly linkUp: (link: Link, signal: AbortSignal) => void;
  readonly contact: WorkerContact;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly draw: () => number;
  readonly logger?: Logger;
}

// Holds a broker connection until the worker stops: a failed connection,
// the first one included, is tried again, and so is a closed one.
export class BrokerSession<Link extends BrokerLink> {
  readonly #options: BrokerSessionOptions<Link>;
  readonly #logger: Logger;

  constructor(options: BrokerSessionOptions<Link>) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const link = await this.#connect(signal);
      if (link !== undefined) await this.#hold(link, signal);
    }
  }

  // The retry delays of a launch: 5 s doubling to 60 s, with jitter.
  async #connect(signal: AbortSignal): Promise<Link | undefined> {
    for (let retry = 1; !signal.aborted; retry += 1) {
      const connected = await this.#options.connect();
      if (connected.ok) return connected.value;
      this.#logger.warn('worker.broker.connect-failed', { retry, reason: connected.error.message });
      await this.#options.sleep(launchRetryDelay(retry, this.#options.draw()), signal);
    }
    return undefined;
  }

  // The link's work runs until the worker stops or the link closes; the
  // link is closed after its work ended.
  async #hold(link: Link, signal: AbortSignal): Promise<void> {
    const ended = new AbortController();
    const linkSignal = AbortSignal.any([signal, ended.signal]);
    try {
      const watched = this.#watch(link, linkSignal).finally(() => ended.abort());
      await Promise.all([watched, this.#options.serve(link, linkSignal)]);
    } finally {
      this.#options.contact.linkDown();
      await link.close();
    }
  }

  // Until the link's statuses end, or the signal aborts.
  async #watch(link: Link, signal: AbortSignal): Promise<void> {
    let up = this.#up(link, signal);
    const statuses = link.statuses[Symbol.asyncIterator]();
    const aborted = abortion(signal);
    for (;;) {
      const next = await Promise.race([statuses.next(), aborted]);
      if (next.done === true) break;
      if (next.value.type === 'disconnect') {
        up.abort();
        this.#logger.debug('worker.broker.disconnected', {});
        this.#options.contact.linkDown();
      } else if (next.value.type === 'reconnect') {
        up.abort();
        this.#logger.debug('worker.broker.reconnected', {});
        up = this.#up(link, signal);
      }
    }
    up.abort();
  }

  #up(link: Link, signal: AbortSignal): AbortController {
    const up = new AbortController();
    this.#options.contact.linkUp();
    this.#options.linkUp(link, AbortSignal.any([signal, up.signal]));
    return up;
  }
}

function abortion(signal: AbortSignal): Promise<{ readonly done: true; readonly value: undefined }> {
  const ended = { done: true as const, value: undefined };
  if (signal.aborted) return Promise.resolve(ended);
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(ended), { once: true }));
}
